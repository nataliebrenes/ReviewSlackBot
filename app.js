const { App } = require('@slack/bolt');

// Initialize the app with your bot token and signing secret
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN
});

// The channel ID where reviews are posted
const REVIEW_CHANNEL_ID = 'YOUR_CHANNEL_ID'; // Replace with your channel ID

// Function to parse a review from message text
function parseReview(text) {
  const dateMatch = text.match(/Date:\s*(\S+)/);
  const pnMatch = text.match(/PN:\s*([^\n]+)/);
  
  if (!dateMatch || !pnMatch) return null;
  
  return {
    date: dateMatch[1].trim(),
    pledgeName: pnMatch[1].trim(),
    fullText: text
  };
}

// Slash command handler
app.command('/review', async ({ command, ack, respond, client }) => {
  await ack();
  
  const searchName = command.text.trim();
  
  if (!searchName) {
    await respond({
      text: 'Please provide a pledge name. Usage: `/review Sophia C.`',
      response_type: 'ephemeral'
    });
    return;
  }
  
  try {
    // Fetch messages from the review channel
    const result = await client.conversations.history({
      channel: REVIEW_CHANNEL_ID,
      limit: 1000 // Adjust based on your needs
    });
    
    const messages = result.messages || [];
    const matchingReviews = [];
    
    // Search through messages for matching reviews
    for (const message of messages) {
      const review = parseReview(message.text || '');
      
      if (review && review.pledgeName.toLowerCase().includes(searchName.toLowerCase())) {
        matchingReviews.push(review);
      }
    }
    
    if (matchingReviews.length === 0) {
      await respond({
        text: `No reviews found for "${searchName}"`,
        response_type: 'ephemeral'
      });
      return;
    }
    
    // Sort by date (most recent first)
    matchingReviews.sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateB - dateA;
    });
    
    // Format the response
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `Reviews for ${matchingReviews[0].pledgeName}`
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Found ${matchingReviews.length} review(s)`
        }
      },
      {
        type: 'divider'
      }
    ];
    
    // Add each review
    matchingReviews.forEach((review, index) => {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: review.fullText
        }
      });
      
      if (index < matchingReviews.length - 1) {
        blocks.push({ type: 'divider' });
      }
    });
    
    await respond({
      blocks: blocks,
      response_type: 'ephemeral' // Only visible to the user who ran the command
    });
    
  } catch (error) {
    console.error('Error fetching reviews:', error);
    await respond({
      text: 'Sorry, there was an error searching for reviews. Please try again.',
      response_type: 'ephemeral'
    });
  }
});

// Start the app
(async () => {
  await app.start();
  console.log('⚡️ Review Search Bot is running!');
})();
