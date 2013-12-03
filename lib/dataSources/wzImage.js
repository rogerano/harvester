// Deps
var
  requester = require("./requester.js"),
  Events  = require("events").EventEmitter,
  moment  = require("moment-timezone"),
  request = require("request"),
  fs      = require("fs"),
  util    = require("util");
var
  log     = util.log;

// Report name of data source.
exports.name = "WeatherZone Radar Image";
exports.dataType = "weather-image";

// Other stuff.
var MINUTE = 60000; // Milliseconds.
var HOUR = MINUTE * 60; // Milliseconds.

var urls = require("./wzImage.json");
// Light error checking on urls structure.
urls.forEach(function(url)
{
  if (!(url.url && url.portCode)) throw exports.name + " url definition not complete.";
});

// Check length of urls array. If no elements, throw error.
if (urls.length === 0)
{
  throw "No urls defined for " + exports.name;
}

// Obtain auth from environment.
var
  authUser = process.env.WZ_AUTH_USER,
  authPass = process.env.WZ_AUTH_PASS;
// If these are not present, throw exception.
if (!(authUser && authPass))
{
  throw "Cannot use " + exports.name + " without credentials.";
}

// Generic request options.
// Generic request options.
var reqOptions = {
  method: "GET",
  proxy: (process.env ? process.env.http_proxy : null),
  url: null, // Updated in the requester
  qs: {
    "service":"WMS",
    "version":"1.1.0",
    "request":"GetMap",
    "width":"1024",
    "height":"1024",
    "srs":"EPSG:4326",
    "format":"image/png"
  },
  headers: {
    Host: "geo.theweather.com.au"
  },
  // This will ensure body is returned as a buffer.
  encoding: null,
  auth: {
    "user": authUser,
    "pass": authPass
  }
};

var lastRun = null; // The last time this store collected data.
// Collect data from web service providers.
exports.collect = collect;
function collect(harvesterCb)
{
  // Define callback functions.
  //
  // Get data from this data source every minute.
  var runCheck = function()
  {
    if (lastRun !== null && Date.now() - lastRun < (MINUTE * 5))
    {
      return false;
    }

    lastRun = Date.now();
    // Otherwise do not run.
    return true;
  };

  // Should we run?
  if (!runCheck()) return false;

  // Iterate over urls, request data from each.
  urls.forEach(function(url)
  {
    if (!url.enabled) return false;

    // Specify a file to write to.
    var filename = url.portCode + ".png";

    // Make a request for data.
    reqOptions.url = url.url;
    request(reqOptions, function(error, res, body)
    {
      log(url.url);
      // Check for errors.
      if (error)
      {
        harvesterCb(error, body);
        return;
      }
      // Response code is not what we want.
      if (!(res.statusCode === 200 || res.statusCode === 304))
      {
        error = error ? error : "Data source responded with status code " + res.statusCode;
        harvesterCb(error, body);
        return;
      }

      // Body is a buffer. Create some metadata for the buffer.
      var imageDetail = {
        buffer: body,
        portCode: url.portCode,
        weather: url.weather
      };

      // Make callback with image details.
      harvesterCb(error, imageDetail);
    });
  });
}

// Process the data.
exports.auger = function(input)
{
  var processor = new Events();

  // Begin processing.
  process.nextTick(function()
  {
    // If we get here, the loop finished iterating over structure without error.
    processor.emit("complete", input);
  });

  // Return the emitter so the consumer can handle important processsing events.
  return processor;
}

// Save the data.
exports.saveData = function (store, data, something)
{
  log(exports.name + " saving data");

  store.saveImage(data);
}