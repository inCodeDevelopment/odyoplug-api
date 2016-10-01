# Документация
Документация по api написана по стандарту open api и лежит в файле `doc.yml`.

Также можно запустить `python -m SimpleHTTPServer` или аналогичную команду в вашей системе и открыть файл `doc.html` для просмотра документации с использование ReDoc

# Запуск

```
git clone git@github.com:artemsmirnov/incode-test.git
cd incode-test
npm i
```

Далее для запуска
```
npm start
```

Или для запуска демоном с помощью forever
```
npm start:forever
```

Для настройки можно создать файл hostName|local.json в папке config либо задать настройки через переменные окружения(смотреть config/custom-environment-variables.json).

# Разворачивание БД
Как база данных используется postgresql, необходима база с расширением `citext`

Для разворачивания чистой структуры можно применть скрипт `npm db:bootstrap`

# Тесты
```
npm test
```