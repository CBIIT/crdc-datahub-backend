import prisma from "../prisma/index.js";
import dotenv from 'dotenv';
import ConfigurationDAO from '../dao/configuration.js';

dotenv.config();
async function main() {
  const config = await new ConfigurationDAO().findByType('CLI_UPLOADER_VERSION');
  console.log(config);
}

main()
  .catch((e) => {
    console.error('Error:', e);
  })
  .finally(() => prisma.$disconnect());
