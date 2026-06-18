import {
  getModelInstance,
  initializeModel,
  getEmbeddingModel,
  loadEnv,
} from '@xui/lib';

// import dotenv from 'dotenv';
// dotenv.config({ path: './.env', quiet: true });
loadEnv();
console.log("xx", process.env.OPENAI_MODEL);
console.log("xx", process.env.OPENAI_API_URL);

initializeModel({
  embedding: getEmbeddingModel(),
  language: getModelInstance(),
});
