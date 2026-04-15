'use strict';

const ping = (req, res) => {
  res.json({ statusCode: 200, message: 'task controller skeleton' });
};

module.exports = { ping };
