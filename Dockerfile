FROM mhart/alpine-node:6.6.0

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

COPY . /usr/src/app

RUN apk add --no-cache make gcc g++ python
RUN npm install

EXPOSE 3000

CMD [ "npm", "start" ]
