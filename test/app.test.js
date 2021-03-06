'use strict';

const assert = require('assert');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const {OAuth2Client} = require('google-auth-library');
const path = require('path');
const sinon = require('sinon');
const supertest = require('supertest');
const proxyquire = require('proxyquire').noPreserveCache();

const message = 'This is a test message sent at: ';
const payload = message + Date.now();

const cwd = path.join(__dirname, '../');
const requestObj = supertest(proxyquire(path.join(cwd, 'app'), {process}));

const fixtures = path.join(__dirname, 'fixtures');
const privateKey = fs.readFileSync(path.join(fixtures, 'privatekey.pem'));
const publicCert = fs.readFileSync(path.join(fixtures, 'public_cert.pem'));

const sandbox = sinon.createSandbox();

const createFakeToken = () => {
  const now = Date.now() / 1000;

  const payload = {
    aud: 'example.com',
    azp: '1234567890',
    email: 'pubsub@example.iam.gserviceaccount.com',
    email_verified: true,
    iat: now,
    exp: now + 3600,
    iss: 'https://accounts.google.com',
    sub: '1234567890',
  };

  const options = {
    algorithm: 'RS256',
    keyid: 'fake_id',
  };

  return jwt.sign(payload, privateKey, options);
};

afterEach(() => {
  sandbox.restore();
});

describe('gae_flex_pubsub_index', () => {
  it('should send a message to Pub/Sub', async () => {
    await requestObj
      .post('/')
      .type('form')
      .send({payload: payload})
      .expect(200)
      .expect(response => {
        assert(new RegExp(/Message \d* sent/).test(response.text));
      });
  });

  it('should list sent Pub/Sub messages', async () => {
    await requestObj
      .get('/')
      .expect(200)
      .expect(response => {
        assert(
          new RegExp(/Messages received by this instance/).test(response.text)
        );
      });
  });
});

describe('gae_flex_pubsub_push', () => {
  it('should receive incoming Pub/Sub messages', async () => {
    await requestObj
      .post('/pubsub/push')
      .query({token: process.env.PUBSUB_VERIFICATION_TOKEN})
      .send({
        message: {
          data: payload,
        },
      })
      .expect(200);
  });

  it('should check for verification token on incoming Pub/Sub messages', async () => {
    await requestObj.post('/pubsub/push').field('payload', payload).expect(400);
  });
});

describe('gae_flex_pubsub_auth_push', () => {
  it('should verify incoming Pub/Sub push requests', async () => {
    sandbox
      .stub(OAuth2Client.prototype, 'getFederatedSignonCertsAsync')
      .resolves({
        certs: {
          fake_id: publicCert,
        },
      });

    await requestObj
      .post('/pubsub/authenticated-push')
      .set('Authorization', `Bearer ${createFakeToken()}`)
      .query({token: process.env.PUBSUB_VERIFICATION_TOKEN})
      .send({
        message: {
          data: Buffer.from(payload).toString('base64'),
        },
      })
      .expect(200);
    await requestObj
      .get('/')
      .expect(200)
      .expect(response => {
        assert(response.text.includes(payload));
      });
  });
});
