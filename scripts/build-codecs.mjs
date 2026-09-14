/** Build the official libjxl tools for the current host, not a rewritten codec.
 * Requires Git, CMake and a C++ compiler. No downloads happen at app runtime.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { root, codecsDir, extension, run, capture } from './common.mjs';

const VERSION = 'v0.12.0';
const EXPECTED_COMMIT_PREFIX = 'a7a9c78'; // official v0.12.0 release commit
const source = path.join(root, '.tools', `libjxl-${VERSION}`);
const build = path.join(root, '.tools', `build-${VERSION}-${process.platform}-${process.arch}`);

try {
  run('git', ['--version']);
  run('cmake', ['--version']);
  fs.mkdirSync(path.dirname(source), { recursive: true });
  if (!fs.existsSync(source)) {
    run('git', [
      'clone',
      '--depth',
      '1',
      '--branch',
      VERSION,
      'https://github.com/libjxl/libjxl.git',
      source,
    ]);
  }
  const commit = capture('git', ['rev-parse', 'HEAD'], source).trim();
  if (!commit.startsWith(EXPECTED_COMMIT_PREFIX))
    throw new Error(
      `Unexpected libjxl checkout: ${commit}. Expected ${VERSION}/${EXPECTED_COMMIT_PREFIX}.`,
    );
  if (capture('git', ['status', '--porcelain', '--untracked-files=no'], source)) {
    throw new Error('libjxl checkout has local changes. Use a clean checkout for packaging.');
  }
  // Only dependencies used by this JPEG-only toolchain. No test image corpus.
  run(
    'git',
    [
      'submodule',
      'update',
      '--init',
      '--depth',
      '1',
      'third_party/brotli',
      'third_party/highway',
      'third_party/skcms',
      'third_party/libjpeg-turbo',
    ],
    { cwd: source },
  );
  // libjxl's strict --reconstruct_jpeg CLI switch is compiled only when
  // JPEG support is present. Build the pinned bundled libjpeg separately;
  // do not accidentally link a machine-specific shared system library.
  const jpegSource = path.join(source, 'third_party', 'libjpeg-turbo');
  const jpegBuild = path.join(
    root,
    '.tools',
    `jpeg-${VERSION}-${process.platform}-${process.arch}`,
  );
  const platformOptions =
    process.platform === 'darwin'
      ? [
          '-DCMAKE_OSX_DEPLOYMENT_TARGET=11.0',
          `-DCMAKE_OSX_ARCHITECTURES=${process.arch === 'arm64' ? 'arm64' : 'x86_64'}`,
        ]
      : [];
  const jobs = String(Math.min(4, os.availableParallelism()));
  run('cmake', [
    '-S',
    jpegSource,
    '-B',
    jpegBuild,
    '-DCMAKE_BUILD_TYPE=Release',
    '-DCMAKE_POLICY_VERSION_MINIMUM=3.5',
    '-DENABLE_SHARED=OFF',
    '-DENABLE_STATIC=ON',
    '-DWITH_TURBOJPEG=OFF',
    '-DWITH_SIMD=OFF',
    '-DCMAKE_POSITION_INDEPENDENT_CODE=ON',
    ...(process.platform === 'win32' ? ['-DWITH_CRT_DLL=OFF'] : []),
    ...platformOptions,
  ]);
  run('cmake', [
    '--build',
    jpegBuild,
    '--config',
    'Release',
    '--target',
    'jpeg-static',
    '--parallel',
    jobs,
  ]);
  const jpegLib = [
    path.join(jpegBuild, 'Release', 'jpeg-static.lib'),
    path.join(jpegBuild, 'jpeg-static.lib'),
    path.join(jpegBuild, 'libjpeg.a'),
    path.join(jpegBuild, 'Release', 'libjpeg.a'),
  ].find((p) => fs.existsSync(p));
  if (!jpegLib) throw new Error(`Static libjpeg was not produced under ${jpegBuild}`);
  const jpegInclude = path.join(jpegBuild, 'public-include');
  fs.mkdirSync(jpegInclude, { recursive: true });
  for (const header of ['jpeglib.h', 'jmorecfg.h']) {
    fs.copyFileSync(path.join(jpegSource, header), path.join(jpegInclude, header));
  }
  fs.copyFileSync(path.join(jpegBuild, 'jconfig.h'), path.join(jpegInclude, 'jconfig.h'));
  const cmakePath = (p) => p.split(path.sep).join('/');
  const config = [
    '-S',
    source,
    '-B',
    build,
    '-DCMAKE_BUILD_TYPE=Release',
    '-DCMAKE_POLICY_VERSION_MINIMUM=3.5',
    '-DBUILD_TESTING=OFF',
    '-DBUILD_SHARED_LIBS=OFF',
    '-DJPEGXL_ENABLE_TOOLS=ON',
    '-DJPEGXL_ENABLE_TRANSCODE_JPEG=ON',
    '-DJPEGXL_ENABLE_BOXES=ON',
    '-DJPEGXL_ENABLE_SKCMS=ON',
    '-DJPEGXL_ENABLE_DEVTOOLS=OFF',
    '-DJPEGXL_ENABLE_BENCHMARK=OFF',
    '-DJPEGXL_ENABLE_EXAMPLES=OFF',
    '-DJPEGXL_ENABLE_FUZZERS=OFF',
    '-DJPEGXL_ENABLE_DOXYGEN=OFF',
    '-DJPEGXL_ENABLE_MANPAGES=OFF',
    '-DJPEGXL_ENABLE_JNI=OFF',
    '-DJPEGXL_ENABLE_SJPEG=OFF',
    '-DJPEGXL_ENABLE_OPENEXR=OFF',
    '-DJPEGXL_ENABLE_TCMALLOC=OFF',
    '-DJPEGXL_ENABLE_VIEWERS=OFF',
    '-DJPEGXL_ENABLE_PLUGINS=OFF',
    '-DCMAKE_DISABLE_FIND_PACKAGE_PNG=ON',
    '-DCMAKE_DISABLE_FIND_PACKAGE_GIF=ON',
    '-DCMAKE_DISABLE_FIND_PACKAGE_JPEG=OFF',
    '-DJPEGXL_BUNDLE_LIBPNG=OFF',
    `-DJPEG_LIBRARY:FILEPATH=${cmakePath(jpegLib)}`,
    `-DJPEG_INCLUDE_DIR:PATH=${cmakePath(jpegInclude)}`,
    ...platformOptions,
  ];
  // The JPEG XL libraries and bundled dependencies are static on every OS.
  // On Windows also link the C runtime statically. On Unix keep the normal
  // platform runtime (glibc/libc++); a glibc-static build is unnecessary.
  if (process.platform === 'win32') config.push('-DJPEGXL_STATIC=ON');
  else config.push('-DJPEGXL_STATIC=OFF');

  run('cmake', config);
  run('cmake', [
    '--build',
    build,
    '--config',
    'Release',
    '--target',
    'cjxl',
    'djxl',
    '--parallel',
    jobs,
  ]);
  fs.mkdirSync(codecsDir, { recursive: true });
  for (const name of ['cjxl', 'djxl']) {
    const candidates = [
      path.join(build, 'tools', 'Release', name + extension),
      path.join(build, 'tools', name + extension),
    ];
    const binary = candidates.find((p) => fs.existsSync(p));
    if (!binary) throw new Error(`Built ${name} not found under ${build}`);
    fs.copyFileSync(binary, path.join(codecsDir, name + extension));
    if (process.platform !== 'win32') fs.chmodSync(path.join(codecsDir, name), 0o755);
  }
  // Preserve notices for bundled native code. CMake writes LICENSE.* for
  // dependencies; include all those plus upstream dependency license files.
  const licenseDir = path.join(codecsDir, 'licenses');
  fs.mkdirSync(licenseDir, { recursive: true });
  for (const entry of fs.readdirSync(build)) {
    if (entry.startsWith('LICENSE.'))
      fs.copyFileSync(path.join(build, entry), path.join(licenseDir, entry));
  }
  const notices = [
    ['LICENSE', 'libjxl-LICENSE'],
    ['PATENTS', 'libjxl-PATENTS'],
    ['third_party/libjpeg-turbo/LICENSE.md', 'libjpeg-turbo-LICENSE.md'],
    ['third_party/libjpeg-turbo/README.ijg', 'libjpeg-turbo-README.ijg'],
    ['third_party/skcms/LICENSE', 'skcms-LICENSE'],
    ['third_party/brotli/LICENSE', 'brotli-LICENSE'],
    ['third_party/highway/LICENSE', 'highway-LICENSE'],
  ];
  for (const [from, to] of notices) {
    if (fs.existsSync(path.join(source, from)))
      fs.copyFileSync(path.join(source, from), path.join(licenseDir, to));
  }
  const manifest = {
    libjxlVersion: VERSION,
    commit,
    platform: process.platform,
    arch: process.arch,
    builtAt: new Date().toISOString(),
    encoder: capture(path.join(codecsDir, 'cjxl' + extension), ['--version']),
    decoder: capture(path.join(codecsDir, 'djxl' + extension), ['--version']),
  };
  fs.writeFileSync(
    path.join(codecsDir, 'build-info.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
  await import('./check-codecs.mjs');
  if (process.exitCode) throw new Error('Built tools failed the capability check.');
  console.log(`Codecs ready in ${codecsDir}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  console.error(
    'See README.md → Системные зависимости. On Windows use a VS Developer terminal with C++ tools.',
  );
  process.exitCode = 1;
}
