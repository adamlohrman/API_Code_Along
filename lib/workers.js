/**
 * Worker-related tasks.
 */

//Dependencies.
const path = require('path');
const fs = require('fs');
const _data = require('./data');
const https = require('https');
const http = require('http');
const helpers = require('./helpers');
const url = require('url');
const _logs = require('./logs');

//Instantiate workers.
let workers = {};

//'workers.gatherAllChecks', will lookup all checks, get their data, send to a validator.
workers.gatherAllChecks = () => {
  //Get all of the checks that exist in the system
  _data.list('checks', (err, checks) => {
    if (!err && checks && checks.length > 0) {
      checks.forEach((check) => {
        //Read in the check data.
        _data.read('checks', check, (err, originalCheckData) => {
          if (!err && originalCheckData) {
            //Pass it to the check validator, and let that function continue or log errors as needed.
            workers.validateCheckData(originalCheckData);
          } else {
            console.log("Error reading one of the checks data.");
          }
        });
      });
    } else {
      console.log("Error: Could not find any checks to process.");
    }
  });
};

//Sanity checking the check-data
workers.validateCheckData = (originalCheckData) => {
  originalCheckData = typeof (originalCheckData) == 'object' && originalCheckData !== null ? originalCheckData : {};

  originalCheckData.id = typeof (originalCheckData.id) == 'string' && originalCheckData.id.trim().length == 20 ? originalCheckData.id.trim() : false;

  originalCheckData.userPhone = typeof (originalCheckData.userPhone) == 'string' && originalCheckData.userPhone.trim().length == 10 ? originalCheckData.userPhone.trim() : false;

  originalCheckData.protocol = typeof (originalCheckData.protocol) == 'string' && ['http', 'https'].indexOf(originalCheckData.protocol) > -1 ? originalCheckData.protocol : false;

  originalCheckData.url = typeof (originalCheckData.url) == 'string' && originalCheckData.url.trim().length > 0 ? originalCheckData.url.trim() : false;

  originalCheckData.method = typeof (originalCheckData.method) == 'string' && ['post', 'get', 'put', 'delete'].indexOf(originalCheckData.method) > -1 ? originalCheckData.method : false;

  originalCheckData.successCodes = typeof (originalCheckData.successCodes) == 'object' && originalCheckData.successCodes instanceof Array && originalCheckData.successCodes.length > 0 ? originalCheckData.successCodes : false;

  originalCheckData.timeoutSeconds = typeof (originalCheckData.timeoutSeconds) == 'number' && originalCheckData.timeoutSeconds % 1 === 0 && originalCheckData.timeoutSeconds >= 1 && originalCheckData.timeoutSeconds <= 5 ? originalCheckData.timeoutSeconds : false;

  //Set the keys that may not be set (if the workers have never seen this check before.)
  originalCheckData.state = typeof (originalCheckData.state) == 'string' && ['up', 'down'].indexOf(originalCheckData.state) > -1 ? originalCheckData.state : 'down';

  originalCheckData.lastChecked = typeof (originalCheckData.lastChecked) == 'number' && originalCheckData.lastChecked > 0 ? originalCheckData.lastChecked : false;

  //If all of the checks pass, pass the data along to the next step of the process.
  if (originalCheckData.id &&
    originalCheckData.userPhone &&
    originalCheckData.protocol &&
    originalCheckData.url &&
    originalCheckData.method &&
    originalCheckData.successCodes &&
    originalCheckData.timeoutSeconds) {
    workers.performCheck(originalCheckData);
  } else {
    console.log("Error: One of the checks is not properly validated. Skipping it.")
  }

};

//Perform the check, send the originalCheckData and the outcome of the check process, in the next step of the process.
workers.performCheck = (originalCheckData) => {
  //Prepare the intial check outcome.
  let checkOutcome = {
    'error': false,
    'responseCode': false
  };

  //Mark that the outcome has not been sent yet.
  let outcomeSent = false;

  //Parse the hostname and the path out of the original check data.
  let parsedUrl = url.parse(originalCheckData.protocol + '://' + originalCheckData.url, true);
  let hostName = parsedUrl.hostname;
  let path = parsedUrl.path; //we are using path and not 'pathname', because we want the entire query string.

  //Construct the request.
  let requestDetails = {
    'protocol': originalCheckData.protocol + ':',
    'hostname': hostName,
    'method': originalCheckData.method.toUpperCase(),
    'path': path,
    'timeout': originalCheckData.timeoutSeconds * 1000
  };

  //Instantiate the request object (using either the http or https module).
  let _moduleToUse = originalCheckData.protocol == 'http' ? http : https;
  let req = _moduleToUse.request(requestDetails, (res) => {
    //Grab the status of the sent request.
    let status = res.statusCode;

    //Update the check outcome and pass the data along.
    checkOutcome.responseCode = status;
    if (!outcomeSent) {
      workers.processCheckOutcome(originalCheckData, checkOutcome);
      outcomeSent = true;
    }
  });

  // Bind to the error event so it doesn't get thrown.
  req.on('error', (e) => {
    //Update the check outcome and pass the data along.
    checkOutcome.error = {
      'error': true,
      'value': e
    };
    if (!outcomeSent) {
      workers.processCheckOutcome(originalCheckData, checkOutcome);
      outcomeSent = true;
    }
  });

  //Bind to the timeout event.
  req.on('timeout', (e) => {
    //Update the check outcome and pass the data along.
    checkOutcome.error = {
      'error': true,
      'value': 'timeout'
    };
    if (!outcomeSent) {
      workers.processCheckOutcome(originalCheckData, checkOutcome);
      outcomeSent = true;
    }
  });

  //End the request.
  req.end();

};

//Process the check outcome and update the check data as needed and trigger an alert to the user, if needed.
//Special logic for accomodating a check that has never been tested before(don't want to alert on that one).
workers.processCheckOutcome = (originalCheckData, checkOutcome) => {
  //Decide if check is considered 'up', or 'down'.
  let state = !checkOutcome.error && checkOutcome.responseCode && originalCheckData.successCodes.indexOf(checkOutcome.responseCode) > -1 ? 'up' : 'down';

  //Decide if an alert is warranted.
  let alertWarranted = originalCheckData.lastChecked && originalCheckData.state !== state ? true : false;

  //Log the outcome.
  let timeOfCheck = Date.now();

  //Update the check data.
  let newCheckData = originalCheckData;
  newCheckData.state = state;
  newCheckData.lastChecked = timeOfCheck;
  console.log(originalCheckData);

  //Save the updates to disk.
  _data.update('checks', newCheckData.id, newCheckData, (err) => {
    if (!err) {
      //Send the new check data to the next phase in the process, if needed.
      if (alertWarranted) {
        workers.alertUserToStatusChange(newCheckData);
      } else {
        console.log('Check outcome has not changed, no alert needed.')
      }
    } else {
      console.log("Error trying to save updates to one of the checks.")
    }
  });
};


//Alert the user as to a change in their check status.
workers.alertUserToStatusChange = (newCheckData) => {
  let msg = 'Alert: Your check for ' + newCheckData.method.toUpperCase() + ' ' + newCheckData.protocol + '://' + newCheckData.url + 'is currently ' + newCheckData.state;
  helpers.sendTwilioSms(newCheckData.userPhone, msg, (err) => {
    if (!err) {
      console.log('Success: User was alerted to a status change in their check, via sms:', msg);
    } else {
      console.log("Error: Could not send sms alert to user who had a state change in their check.");
    }
  });
};

workers.log = (originalCheckData, checkOutcome, state, alertWarranted, timeOfCheck) => {
  //Form the log data.
  let logData = {
    'check': originalCheckData,
    'outcome': checkOutcome,
    'state': state,
    'alert': alertWarranted,
    'time': timeOfCheck
  };
  console.log(logData);

  //Convert data to a string.
  let logString = JSON.stringify(logData);

  //Determine the name of the log file.
  let logFileName = originalCheckData.id;

  //Append the log string to the file
  _logs.append(logFileName, logString, (err) => {
    if (!err) {
      console.log("Logging to file succeeded.");
    } else {
      console.log("Logging to file did not succeed.");
    }
  });
};

// Timer to execute the worker-process once per minute.
workers.loop = () => {
  setInterval(() => {
    workers.gatherAllChecks();
  }, 1000 * 60);
};






//Init Script
workers.init = () => {
  //Execute all of the checks on start-up.
  workers.gatherAllChecks();
  //Call the loop so the checks will execute automatically.
  workers.loop();
  // //Log the checks into the log directory.
  // workers.log();
};

//Export workers.
module.exports = workers;