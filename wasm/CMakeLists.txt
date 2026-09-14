cmake_minimum_required(VERSION 3.20)
project(jexfold_wasm LANGUAGES C CXX)

if(NOT EMSCRIPTEN)
  message(FATAL_ERROR "Build this target with emcmake.")
endif()
if(NOT LIBJXL_SOURCE_DIR)
  message(FATAL_ERROR "Set LIBJXL_SOURCE_DIR to the pinned libjxl checkout.")
endif()

set(BUILD_TESTING OFF CACHE BOOL "" FORCE)
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_TOOLS OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_DEVTOOLS OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_EXAMPLES OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_BENCHMARK OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_DOXYGEN OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_MANPAGES OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_JNI OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_SJPEG OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_OPENEXR OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_TCMALLOC OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_VIEWERS OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_PLUGINS OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_SKCMS ON CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_TRANSCODE_JPEG ON CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_BOXES ON CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_WASM_THREADS OFF CACHE BOOL "" FORCE)
set(JPEGXL_BUNDLE_LIBPNG OFF CACHE BOOL "" FORCE)
set(CMAKE_DISABLE_FIND_PACKAGE_JPEG ON CACHE BOOL "" FORCE)
set(CMAKE_DISABLE_FIND_PACKAGE_PNG ON CACHE BOOL "" FORCE)
set(CMAKE_DISABLE_FIND_PACKAGE_GIF ON CACHE BOOL "" FORCE)

add_subdirectory(${LIBJXL_SOURCE_DIR} libjxl EXCLUDE_FROM_ALL)
add_executable(jexfold_codec src/jexfold_codec.cc)
target_compile_features(jexfold_codec PRIVATE cxx_std_17)
target_compile_options(jexfold_codec PRIVATE -O3 -msimd128)
target_link_libraries(jexfold_codec PRIVATE jxl)
target_link_options(jexfold_codec PRIVATE
  -O3 -msimd128
  "-sMODULARIZE=1"
  "-sEXPORT_ES6=1"
  "-sENVIRONMENT=worker"
  "-sFILESYSTEM=0"
  "-sALLOW_MEMORY_GROWTH=1"
  "-sINITIAL_MEMORY=67108864"
  "-sMAXIMUM_MEMORY=2147483648"
  "-sEXPORTED_FUNCTIONS=['_malloc','_free','_jexfold_encode_jpeg','_jexfold_reconstruct_jpeg','_jexfold_decode_rgba','_jexfold_result_data','_jexfold_result_size','_jexfold_result_error','_jexfold_result_width','_jexfold_result_height']"
  "-sEXPORTED_RUNTIME_METHODS=['HEAPU8']"
)
set_target_properties(jexfold_codec PROPERTIES SUFFIX ".js")
