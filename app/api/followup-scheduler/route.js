import { withApiHandler } from '../../../lib/apiResponse';
import { processDueFollowups } from '../../../lib/services/followupSchedulerService';

const handler = async () => {
  const result = await processDueFollowups();
  return {
    message: 'Followup scheduler completed',
    ...result
  };
};

export const POST = withApiHandler(handler, 'followupSchedulerRoute');
