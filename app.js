'use strict';

const express = require('express');
const {OAuth2Client} = require('google-auth-library');
const path = require('path');
const process = require('process'); 
const {PubSub} = require('@google-cloud/pubsub');

const authClient = new OAuth2Client();
const pubsub = new PubSub();

const app = express();
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));


const formBodyParser = express.urlencoded({extended: false});
const jsonBodyParser = express.json();
const messages = [];
const claims = [];
const tokens = [];
const {PUBSUB_VERIFICATION_TOKEN} = process.env;
const TOPIC = "Libros"//process.env.PUBSUB_TOPIC;

const topic = pubsub.topic(TOPIC);

app.get('/', (req, res) => {
  res.render('index', {messages, tokens, claims});
});

app.post('/', formBodyParser, async (req, res, next) => {
  if (!req.body.payload) {
    res.status(400).send('Missing payload');
    return;
  }

  const data = Buffer.from(req.body.payload);
  try {
    const messageId = await topic.publish(data);
    res.status(200).send(`Message ${messageId} sent.`);
  } catch (error) {
    next(error);
  }
});

app.post('/pubsub/push', jsonBodyParser, (req, res) => {
  if (req.query.token !== PUBSUB_VERIFICATION_TOKEN) {
    res.status(400).send();
    return;
  }

  const message = Buffer.from(req.body.message.data, 'base64').toString(
    'utf-8'
  );

  messages.push(message);

  res.status(200).send();
});

app.post('/pubsub/authenticated-push', jsonBodyParser, async (req, res) => {
  if (req.query.token !== PUBSUB_VERIFICATION_TOKEN) {
    res.status(400).send('Invalid request');
    return;
  }

  try {
    const bearer = req.header('Authorization');
    const [, token] = bearer.match(/Bearer (.*)/);
    tokens.push(token);

    const ticket = await authClient.verifyIdToken({
      idToken: token,
      audience: 'example.com',
    });

    const claim = ticket.getPayload();

    claims.push(claim);
  } catch (e) {
    res.status(400).send('Invalid token');
    return;
  }

  const message = Buffer.from(req.body.message.data, 'base64').toString(
    'utf-8'
  );

  messages.push(message);

  res.status(200).send();
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`App listening on port ${PORT}`);
  console.log('Press Ctrl+C to quit.');
});

module.exports = app;
