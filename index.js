const dotenv = require('dotenv').config();
const express = require('express');
const app = express();
const crypto = require('crypto');
const cookie = require('cookie');
const nonce = require('nonce')();
const querystring = require('querystring');
const request = require('request-promise');
var mongoClient = require("mongodb").MongoClient;
var objectId = require("mongodb").ObjectID;
var fs = require("fs");

const apiKey = process.env.SHOPIFY_API_KEY;
const apiSecret = process.env.SHOPIFY_API_SECRET;
const scopes = 'read_products, read_script_tags, write_script_tags';
const forwardingAddress = process.env.FORWARDING_ADDRESS; // Replace this with your HTTPS Forwarding address
const client_app_lib_path = "/app_client.js"
var database = null;

var url = process.env.MONGODB_URI;
var dbConnect = mongoClient.connect(url)

var bodyParser = require('body-parser');
app.use(bodyParser.json()); // support json encoded bodies
app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies

app.use(express.static(__dirname + '/public'));
app.disable('etag');
app.use(function (req, res, next) {
    // Website you wish to allow to connect
    res.setHeader('Access-Control-Allow-Origin', '*');
    // Request methods you wish to allow
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    // Request headers you wish to allow
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    // Set to true if you need the website to include cookies in the requests sent
    // to the API (e.g. in case you use sessions)
    res.setHeader('Access-Control-Allow-Credentials', true);
    // Pass to next layer of middleware
    next();
});

app.set('port', (process.env.PORT || 5000));

function updateStat(session, page, domain) {
  dbConnect.then((db) => {
    console.log('Find page:');
    return db.collection("pages").findOne({domain: domain, page: page});
  }).then((pages) => {
    console.log(pages);
    if (pages == null) {
      return dbConnect.then((db) => {
        console.log('Insert page');
        return db.collection("pages").insertOne({domain: domain, page: page, count: 1});
      });
    } else {
      return dbConnect.then((db) => {
        console.log('Update page');
        return db.collection("pages").updateOne({domain: domain, page: page}, { $inc: {count: 1}});
      });
    }
  }).then((result) => {
    return dbConnect.then((db) => {
      console.log('Find session');
      return db.collection("sessions").findOne({domain: domain, session: session});
    }); //.update({session: session}, {$inc : {count: 1}}, {safe: true});
  }).then((sessions) => {
    console.log(sessions);
    if (sessions == null) {
      return dbConnect.then((db) => {
        console.log('Insert session');
        return db.collection("sessions").insertOne({domain: domain, session: session, count: 1})
      }).then((result) => {
        return dbConnect.then((db) => {
          console.log('Find uniq session');
          return db.collection("uniqSession").findOne({domain: domain});
        })
      }).then((uniqSession) => {
          console.log(uniqSession);
          if (uniqSession == null) {
            return dbConnect.then((db) => {
              console.log('Insert uniq session');
              return db.collection("uniqSession").insertOne({domain: domain, count: 1});
            });
          } else {
            return dbConnect.then((db) => {
              console.log('Update uniq session');
              return db.collection("uniqSession").updateOne({domain: domain}, { $inc: {count: 1}});
            });
          };
        });
    } else {
      return dbConnect.then((db) => {
        console.log('Update session');
        return db.collection("sessions").updateOne({domain: domain, session: session}, { $inc: {count: 1}});
      });
    }
  }).catch((error) => {
    console.log(error);
  });
};

app.get('/', (req, res) => {
  res.send('hi');
});

app.get('/email', (req, res) => {
  fs.readFile("views/email.html", "utf8", function(error, data){

		var shop = req.query.shop;
    console.log(data);
    data = data.replace("{shop}", shop);
		res.end(data);
	})
});

app.post('/email', (req, res) => {
  var email = req.body.email;
  var shop = req.body.shop;
  dbConnect.then((db) => {
    return db.collection("shop").updateOne({domain: shop}, {$set: {app_email: email}})
  }).then((result) => {
    res.redirect(`https://${shop}/admin/apps`);
  }).catch((error) => {
    console.log(error);
    res.render(`${forwardingAddress}/email?shop=${shop}`);
  });
});

app.post('/stat', (req, res) => {
  updateStat(req.body.session, req.body.pageName, req.body.host);
  res.send('ok');
});

app.get('/stat', (req, res) => {
  dbConnect.then((db) => {
    return Promise.all([
      db.collection("uniqSession").find({}).toArray(),
      db.collection("sessions").find({}).toArray(),
      db.collection("pages").find({}).toArray()
    ])})
    .then((results) => {
      var result = {};
      result.uniqSessions = results[0]
      result.sessions = results[1];
      result.pages = results[2];
      // database.close();
      return result;
    }).then((result) => {
      res.status(200).send(result);
    }).catch((error) => {
      res.status(401).send(error);
    });
});



app.get('/shopify', (req, res) => {
  const shop = req.query.shop;
  if (shop) {
    const state = nonce();
    const redirectUri = forwardingAddress + '/shopify/callback';
    const installUrl = 'https://' + shop +
      '/admin/oauth/authorize?client_id=' + apiKey +
      '&scope=' + scopes +
      '&state=' + state +
      '&redirect_uri=' + redirectUri;

    res.cookie('state', state);
    res.redirect(installUrl);
  } else {
    return res.status(400).send('Missing shop parameter. Please add ?shop=your-development-shop.myshopify.com to your request');
  }
});

app.get('/shopify/callback', (req, res) => {
  const { shop, hmac, code, state } = req.query;
  const stateCookie = cookie.parse(req.headers.cookie).state;

  if (state !== stateCookie) {
    return res.status(403).send('Request origin cannot be verified');
  }

  if (shop && hmac && code) {
    // DONE: Validate request is from Shopify
    const map = Object.assign({}, req.query);
    delete map['signature'];
    delete map['hmac'];
    const message = querystring.stringify(map);
    const generatedHash = crypto
      .createHmac('sha256', apiSecret)
      .update(message)
      .digest('hex');

    if (generatedHash !== hmac) {
      return res.status(400).send('HMAC validation failed');
    }

    // DONE: Exchange temporary code for a permanent access token
    const accessTokenRequestUrl = 'https://' + shop + '/admin/oauth/access_token';
    const accessTokenPayload = {
      client_id: apiKey,
      client_secret: apiSecret,
      code,
    };

    request.post(accessTokenRequestUrl, { json: accessTokenPayload })
    .then((accessTokenResponse) => {
      const accessToken = accessTokenResponse.access_token;
      // DONE: Use access token to make API call to 'shop' endpoint
      const shopRequestUrl = 'https://' + shop + '/admin/shop.json';
      const shopRequestHeaders = {
        'X-Shopify-Access-Token': accessToken,
      };
      const shopScriptTagUrl = 'https://' + shop + '/admin/script_tags.json';
      const src_script = forwardingAddress + client_app_lib_path;
      const shopScriptTag = {
                              script_tag: {
                                event: "onload",
                                src: src_script
                              }
                            };
      return Promise.all([request.post(shopScriptTagUrl, { headers: shopRequestHeaders, json: shopScriptTag }),
                   request.get(shopRequestUrl, { headers: shopRequestHeaders })]);
    })
    .then((allResponses) => {
      var scriptTagResponse = allResponses[0];
      var shopResponse = allResponses[1];
      var shop = JSON.parse(shopResponse);
      return dbConnect.then(function(db) {
        database = db;
        return Promise.all([
          db.collection("scriptTag").insertOne(scriptTagResponse),
          db.collection("shop").insertOne(shop)
        ])})
        .then((results) => {

          console.log(results[0].ops);
          console.log(results[1].ops);
          // database.close();
          return shopResponse;
        })
        .catch((error) => {
          console.log(error);
        });

    })
    .then((result) => {
      console.log(result);
      // res.status(200).end(result);
      // res.redirect(`https://${shop}/admin/apps`);
      res.render(`${forwardingAddress}/email?shop=${shop}`);

    })
    .catch((error) => {
      console.log(error);
      // res.status(error.statusCode).send(error.error.error_description);
    });

  } else {
    res.status(400).send('Required parameters missing');
  }
});

app.listen(app.get('port'), () => {
  console.log('Example app listening on port ' + app.get('port') + '!');
});
