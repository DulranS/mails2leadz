import { withApiHandler } from '../../../lib/apiResponse';
import { processAutoReplyBatch } from '../../../lib/services/autoReplyProcessorService';

const handler = async () => {
  const result = await processAutoReplyBatch();
  return {
    message: 'Auto-reply processing completed',
    ...result
  };
};

export const POST = withApiHandler(handler, 'autoReplyProcessorRoute');
