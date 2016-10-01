# Авторизация запросов
Для авторизации запроса необходимо передать access_token токен полученный одним из описаных ниже путей в заголовке Authorization. Например:
```
Authorization: dij491h4f13hf48h340f8h3fuh3.f34f13f314f34f3f4.f134f13f4134f13
```

# Регистрация по почте и паролю
```
POST /api/users/signup
{
	"email": "john.doe@example.com",
	"password": "keyboard+cat",
	"username": "John Doe"
}
```
Ответ сервера будет иметь следующий вид:
```
{
	"access_token": "20h0y29f94fy9f2394fy23gf49423",
	"user": {
		"id": 4,
		"username": "",
		"email": "fubar@gmail.com"
	}
}
```

# Вход по почте и паролю
```
POST /api/users/signin
{
	"email": "john.doe@example.com",
	"password": "keyboard+cat"
}
```
Ответ сервера будет иметь следующий вид:
```
{
	"access_token": "20h0y29f94fy9f2394fy23gf49423",
	"user": {
		"id": 4,
		"username": "",
		"email": "fubar@gmail.com"
	}
}
```

# Вход через социальную сеть
Для авторизации через социальную сеть нужно открыть в поп-апе `/api/users/signin/{provider}`.

Пользователь будет автоматически перенаправлен на сайт социальной сети.

В случае неудачной авторизации он будет перенаправлен на `$baseUrl/$socialAuth.callbackFailure`(по умолчанию `/social_auth_callback_failure.html`) c `error` в query params.

В случае успешной авторизации пользователь будет перемещен на `$baseUrl/$socialAuth.callback`(по умолчанию `/social_auth_callback.html`). 

Если пользователь с привязкой к этому аккаунту найден то в `query.status` будет лежать `authorized`, а в `query.access_token` неопсредственно ключ для авторизации запросов на odyoplug.

Если пользователь с привязкой к этому аккаунту не был найден то в `query.status` будет лежать `not_authorized`, а в `query.auth_code` токен с помощью которого в дальнейшем можно будет привязать этот аккаунт к аккаунту в odyoplug.

# Привязка аккаунта соц.сети к аккаунту odyoplug
К аккаунту в odyoplug можно привязать аккаунт соц.сети с помощью полученного ранее auth_code, для этого необходимо выполнить запрос:
```
POST /api/users/link
{
	"auth_code": "di32ff2.432f4f23f.23ffd234f34"
}
```
Этот запрос необходимо авторизовать с помощью access_token переданого согласно описанию в начале данного документа.