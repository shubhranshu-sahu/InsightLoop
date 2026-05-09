const mongoose = require('mongoose');

const connectMongo = async () => {
  try {
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/insightloop';

    await mongoose.connect(uri);

    console.log('✅ MongoDB connected successfully');

    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️  MongoDB disconnected');
    });
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    throw error;
  }
};

module.exports = { connectMongo };
