const mongoose = require('mongoose');

// Every model serialises as { id, ...fields } instead of { _id, __v }.
mongoose.plugin((schema) => {
  schema.set('toJSON', {
    versionKey: false,
    transform(_doc, ret) {
      ret.id = String(ret._id);
      delete ret._id;
      return ret;
    },
  });
});

module.exports = {
  User: require('./User'),
  Service: require('./Service'),
  Booking: require('./Booking'),
  Transaction: require('./Transaction'),
  Session: require('./Session'),
  OtpCode: require('./OtpCode'),
};
