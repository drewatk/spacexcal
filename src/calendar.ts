import * as fs from 'fs';
import { calendar_v3, google } from 'googleapis';
import * as readline from 'readline';
import { ILaunch } from './index';

// If modifying these scopes, delete credentials.json.
const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const TOKEN_PATH = 'token.json';

const CALENDAR_ID = 'csrgj6c96oqealf0di0jl0km58@group.calendar.google.com';

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback, ...args): Promise<any> {
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
    client_id, client_secret, redirect_uris[0]);

  // Check if we have previously stored a token.
  return new Promise((resolve, reject) => {
    fs.readFile(TOKEN_PATH, (err, token) => {
      if (err) { return getAccessToken(oAuth2Client, callback); reject(err); }
      oAuth2Client.setCredentials(JSON.parse(token.toString()));
      resolve(callback(oAuth2Client, ...args));
    });
  });

}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getAccessToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url:', authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question('Enter the code from that page here: ', (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) { return callback(err); }
      oAuth2Client.setCredentials(token);
      // Store the token to disk for later program executions
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) { console.error(err); }
        console.log('Token stored to', TOKEN_PATH);
      });
      callback(oAuth2Client);
    });
  });
}

function clearAndAddLaunches(auth: string, launches: ILaunch[]): Promise<any> {
  const calendar = google.calendar({ version: 'v3', auth });

  return calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin: (new Date()).toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  }).then((res) => {
    const events = res.data.items;

    console.log(`Clearing ${events.length} events from the calendar...`);

    return Promise.all(events.map((event) => {
      return calendar.events.delete({ calendarId: CALENDAR_ID, eventId: event.id });
    })).then(() => {
      console.log('Cleared events. Adding new launches to the calendar');
      return Promise.all(launches.map((launch) => {
        console.log(`Adding ${launch.payload} to the calendar.`);
        const requestBody: calendar_v3.Schema$Event = {
          summary: `${launch.payload} - ${launch.vehicle}`,
          start: launch.allDay ? { date: launch.date.format('YYYY-MM-DD') } : { dateTime: launch.date.toISOString() },
          end: launch.allDay ? {
            date: launch.date.format('YYYY-MM-DD'), timeZone: 'UTC',
          } : {
              dateTime: launch.date.add(30, 'minutes').toISOString(), timeZone: 'UTC',
            },
          source: { title: 'r/SpaceX Launch Manifest', url: 'https://www.reddit.com/r/SpaceX/wiki/launches/manifest' },

        };

        return calendar.events.insert({
          calendarId: CALENDAR_ID, requestBody,
        });
      }));
    });

  });
}

export function addLaunchesToCalendar(launches: ILaunch[]): Promise<any> {
  // Load client secrets from a local file.
  return new Promise((resolve, reject) => {
    fs.readFile('credentials.json', (err, content) => {
      if (err) {
        console.log('Error loading client secret file:', err);
        reject(err);
      }
      // Authorize a client with credentials, then call the Google Calendar API.x
      resolve(authorize(JSON.parse(content.toString()), clearAndAddLaunches, launches));
    });
  });
}
