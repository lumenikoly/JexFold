# Сторонние компоненты

Собственный код JPEG Archiver лицензирован под MIT, см. LICENSE.
Бинарники сторонних компонентов не включены в исходный ZIP.

Основные зависимости приложения:

| Компонент | Назначение | Лицензия upstream |
|---|---|---|
| Rust / Cargo | язык и сборка | MIT / Apache-2.0 |
| Tauri 2, плагины Tauri | настольная оболочка | MIT / Apache-2.0 |
| React | интерфейс | MIT |
| Vite | сборка интерфейса | MIT |
| TypeScript | типизация | Apache-2.0 |
| libjxl | официальный кодек JPEG XL | BSD-3-Clause, PATENTS |
| libjpeg-turbo | JPEG-поддержка инструментов | см. LICENSE.md и README.ijg upstream |
| Brotli, Highway, skcms | зависимости libjxl | см. включаемые уведомления upstream |

`scripts/build-codecs.mjs` сохраняет применимые уведомления из исходных деревьев
и результатов CMake в `src-tauri/resources/codecs/licenses/`. Каталог включается
в ресурсы установщика. Версия и полный полученный коммит записываются в
`build-info.json` рядом с кодеками.

Тестовые JPEG в `crates/jxl-core/tests/fixtures/` созданы программно: цветной
узор и тестовые EXIF-поля. Сторонние фотографии не используются.
