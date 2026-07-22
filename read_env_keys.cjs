const fs = require('fs');
const dotenv = require('dotenv');

if (fs.existsSync('.env')) {
  const envConfig = dotenv.parse(fs.readFileSync('.env'));
  console.log("Env Keys:", Object.keys(envConfig));
} else {
  console.log(".env file not found");
}
