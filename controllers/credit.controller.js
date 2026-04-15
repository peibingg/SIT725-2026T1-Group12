'use strict';

const ping = (req, res) => {
  res.json({ statusCode: 200, message: 'credit controller skeleton' });
};

module.exports = { ping };
