import * as cheerio from 'cheerio';
import * as low from 'lowdb';
import * as FileSync from 'lowdb/adapters/FileSync';
import * as moment from 'moment';
// @ts-ignore
import * as rp from 'request-promise';
import { addLaunchesToCalendar } from './calendar';

// Set up database
const adapter = new FileSync('db.json');
const db = low(adapter);
db.defaults({ launches: [] })
  .write();

export interface ILaunch {
  date: moment.Moment;
  allDay: boolean;
  payload: string;
  customer: string;
  vehicle: string;
}

function getLaunches(): Promise<ILaunch[]> {
  console.log('Looking for Launches on r/SpaceX...');

  const options = {
    uri: 'https://www.reddit.com/r/SpaceX/wiki/launches/manifest',
    transform(body: string) {
      return cheerio.load(body);
    },
  };

  return rp(options)
    .then(($: CheerioStatic) => {

      const launches: ILaunch[] = [];

      $('#wiki_upcoming_falcon_launches').next().find('tr').each((i, elem) => {
        const row = $(elem);
        const dateString = $(row.children().get(0)).text();

        let date: moment.Moment;
        let allDay: boolean;

        if (dateString.indexOf('[') > -1) {
          date = moment.utc(dateString, ['YYYY MMM D \\[HH:mm\\]']);
          allDay = false;
        } else {
          date = moment.utc(dateString, 'YYYY MMM D', true);
          allDay = true;
        }

        const customer = $(row.children().get(6)).text();
        const payload = $(row.children().get(5)).text();
        const vehicle = $(row.children().get(1)).text();

        if (date && date.isValid()) {
          launches.push({ date, allDay, payload, vehicle, customer });
        }
      });
      return launches;
    });
}

function saveLaunches(launches: ILaunch[]): void {
  db.set('launches', launches)
    .write();
}

getLaunches().then(((launches) => {
  console.log(`Found ${launches.length} launches. Clearing calendar and adding to calendar`);
  Promise.all([
    saveLaunches(launches),
    addLaunchesToCalendar(launches),
  ]).catch((error) => {
    console.log(error);
  });
}));
