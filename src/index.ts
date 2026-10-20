import { createApp } from './app.ts';
import { openDb } from './db.ts';
import { scheduleWeatherImport } from './weather.ts';

const port = Number(process.env.PORT ?? 3000);
const dbPath = process.env.DB_PATH ?? './data/deliveryfee.db';
const weatherUrl =
  process.env.WEATHER_API_URL ??
  'https://www.ilmateenistus.ee/ilma_andmed/xml/observations.php';

const db = openDb(dbPath);
scheduleWeatherImport(db, weatherUrl);

createApp(db).listen(port, () => {
  console.info(`Listening on http://localhost:${port}`);
});
