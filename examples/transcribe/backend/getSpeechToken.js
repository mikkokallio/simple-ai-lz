const { app } = require('@azure/functions');

// HTTP trigger to get Speech Service token for frontend
app.http('getSpeechToken', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            const speechKey = process.env.AZURE_SPEECH_KEY;
            const speechRegion = 'swedencentral';
            
            if (!speechKey) {
                return {
                    status: 500,
                    jsonBody: { error: 'Speech service not configured' }
                };
            }

            return {
                status: 200,
                jsonBody: {
                    token: speechKey, // In production, exchange for a time-limited token
                    region: speechRegion
                }
            };
        } catch (error) {
            context.error(`Error getting speech token: ${error.message}`);
            return {
                status: 500,
                jsonBody: { error: error.message }
            };
        }
    }
});
