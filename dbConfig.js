// Cargar las variables de entorno desde el archivo .env
require('dotenv').config();

module.exports = {
  firebird: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_DATABASE,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    lowercase_keys: false,
    role: null,
    pageSize: process.env.DB_PAGESIZE,
    charset: process.env.DB_CHARSET,
  },
  token: process.env.DB_TOKEN
};
