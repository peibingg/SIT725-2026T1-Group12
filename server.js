'use strict';

const mongoose = require('mongoose');
const app = require('./app');

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/taskMarketplaceDB';

mongoose.connect(MONGODB_URI);
mongoose.connection.on('connected', () => {
  console.log('MongoDB connected:', MONGODB_URI);
});
mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err.message);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
