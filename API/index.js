const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const seguridad = require('./seguridad');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.json({ mensaje: 'API del Hotel funcionando' });
});

app.listen(port, () => {
  console.log(`🚀 API corriendo en http://localhost:${port}`);
});
