'use strict';

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ statusCode: 401, message: 'Authentication required' });
  }
  next();
}

module.exports = { requireAuth };
