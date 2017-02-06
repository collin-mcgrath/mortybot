var express = require('express'),
    bodyParser = require('body-parser'),
    request = require('request'),
    app = express(),
    port = process.env.PORT || 3000;

try {
  config = require('./config.json');
  console.log("Required local dev config");
} catch (err) {
  console.log("Local config.json not needed on Heroku. Using Heroku config instead.");
}

var semaphoreAuth = process.env.SEMAPHORE_AUTH || config.semaphoreAuth;
var projectHashID = process.env.PROJECT_HASH_ID || config.projectHashID;
var branchID = process.env.BRANCH_ID || config.branchID;
var slackChannelURL = process.env.SLACK_CHANNEL_URL || config.slackChannelURL;

app.use(bodyParser.json());

app.get('/', function (req, res) {
  res.send("Welcome to Mortybot!");
});

app.post('/', function (req, res) {
  console.log("Request received. Request body:\n" + JSON.stringify(req.body));
  var buildNumber = req.body.build_number;

  getBuildLogs(buildNumber);

  res.json({
    message: 'Request received.'
  });
});

function getBuildLogs (buildNumber) {
  var results;
  var buildUrl = "https://semaphoreci.com/api/v1/projects/" + projectHashID + "/" + branchID + "/builds/" + buildNumber + "/log?auth_token=" + semaphoreAuth;
  console.log("Getting logs for build " + buildNumber + ".");
  request(buildUrl, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var parsed = JSON.parse(body);
      var output = parsed.threads[0].commands[8].output;
      var results = output.split("-------------------------------------------------------------------------------")[2];
      if (results === null) {
        results = output.split("\n");
        results = results[results.length - 1];
        console.log("No results found for build " + buildNumber + ". Printing last line:" + results);
      }
      sendSlackMessage(buildNumber, results);
    }
  });
}

function sendSlackMessage (build, message) {
  var body = formatSlackMessage(build, message);

  request({
    url: slackChannelURL,
    method: 'POST',
    body: JSON.stringify(body)
  });

  console.log("Sending message to " + body.channel + " Slack channel. Message text included below: \n" + JSON.stringify(body));
}

function formatSlackMessage(build, message, buildUrl) {
  body = {};
  // body.text = message;
  body.channel = "#qabot_testing";
  body.username = "Morty Smith";
  // body.icon_emoji = ":morty:";
  body.icon_url = "https://d13yacurqjgara.cloudfront.net/users/1218055/screenshots/2958826/morty_1x.jpg";

  body.attachments = [];
  attachment = {};
  // Pass the `build_url` down from the initial request and link to it here
  // Requires some refactoring of the getBuildLogs method so we don't have a
  // ton of parameters
  attachment.pretext = "<https://google.com|Build " + build + ">";
  attachment.text = message;
  // Add coloring here based on results
  // green = all passing, red = one or more failed, orange = expired or something else
  // 'good', 'danger', 'warning'
  attachment.color = 'good';
  body.attachments[0] = attachment;

  return body;
}

var server = app.listen(port, function () {
  var host = server.address().address;
  var port = server.address().port;
  console.log('Example app listening at http://%s:%s', host, port);
});
