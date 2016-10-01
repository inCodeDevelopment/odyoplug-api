# API Docs
```
python -m SimpleHTTPServer
```
Open `http://localhost:8000/doc.html` in browser

[Authorization guide](docs/auth.md)

# Install & Run
```
npm i
npm start
```

# Configuration
All configuration options are presented in `config/custom-environment-variables.json`

# Bootstrap DB
Postgres + citext extension is used

Run `npm run db:bootstrap` to create up to date schemas in your database

# Tests
```
npm test
```