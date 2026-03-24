import analyzeImageHandler from '../api/analyze-image.js';
import analyzeOutfitPhotoHandler from '../api/analyze-outfit-photo.js';
import chatHandler from '../api/chat.js';
import chatStreamHandler from '../api/chat/stream.js';
import enhanceItemImageHandler from '../api/enhance-item-image.js';
import generateItemImageHandler from '../api/generate-item-image.js';
import generateOutfitVisualizationHandler from '../api/generate-outfit-visualization.js';
import generateStyleDnaHandler from '../api/generate-style-dna.js';
import outfitFeedbackHandler from '../api/outfit-feedback.js';
import preprocessReferenceHandler from '../api/preprocess-reference.js';
import uploadHandler from '../api/upload.js';

export const apiRouteManifest = Object.freeze([
  { method: 'POST', path: '/api/chat', bodyMode: 'json', requiresAuth: true, handler: chatHandler },
  { method: 'POST', path: '/api/chat/stream', bodyMode: 'json', requiresAuth: true, handler: chatStreamHandler },
  { method: 'POST', path: '/api/upload', bodyMode: 'multipart', requiresAuth: true, handler: uploadHandler },
  { method: 'POST', path: '/api/analyze-image', bodyMode: 'json', requiresAuth: true, handler: analyzeImageHandler },
  { method: 'POST', path: '/api/analyze-outfit-photo', bodyMode: 'json', requiresAuth: true, handler: analyzeOutfitPhotoHandler },
  { method: 'POST', path: '/api/generate-outfit-visualization', bodyMode: 'json', requiresAuth: true, handler: generateOutfitVisualizationHandler },
  { method: 'POST', path: '/api/generate-item-image', bodyMode: 'json', requiresAuth: true, handler: generateItemImageHandler },
  { method: 'POST', path: '/api/enhance-item-image', bodyMode: 'json', requiresAuth: true, handler: enhanceItemImageHandler },
  { method: 'POST', path: '/api/preprocess-reference', bodyMode: 'json', requiresAuth: true, handler: preprocessReferenceHandler },
  { method: 'POST', path: '/api/generate-style-dna', bodyMode: 'json', requiresAuth: true, handler: generateStyleDnaHandler },
  { method: 'POST', path: '/api/outfit-feedback', bodyMode: 'json', requiresAuth: true, handler: outfitFeedbackHandler },
]);
