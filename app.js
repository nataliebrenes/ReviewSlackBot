const { App } = require('@slack/bolt');

// Initialize the app with your bot token and signing secret
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN
});

// The channel ID where reviews are posted
const REVIEW_CHANNEL_ID = 'C09K90ZEWV7';

// List of all pledges
const PLEDGES = [
  "Adrina Khatchikyan", "Aidan Sogorka", "Alexia Barron", "Allyson Bender", 
  "Ana Benito", "Aryan Pusuluri", "Asher Laynor", "Audrey Chiang", 
  "Blake Wanders", "Brandon Garrity", "Brent Pearson", "Bryanna Jacinto-Vazquez", 
  "Calista Clay", "Chelsea Reilly", "Darren Panettiere", "Dina Schoengarth", 
  "Donya Adibi", "Elianna Pineda", "Ellen Rieger", "Franky Ruiz", 
  "Gary Chavarria", "Grace Hoffman", "Hannah Just Milender", "Jack Dougenis", 
  "Jack Martin", "Jaden Chima", "Jena Reilich", "Jeremiah Simmons", 
  "Jeswin Ovelil", "Jonathan Park", "Jordanne Arabe", "Kosei van Doorn", 
  "Lana den Hartog", "Liam Cringan", "Louis Addeo", "Makena Willis", 
  "Nick Rankin", "Olivia Kuhl", "Payton Lourenco", "Raihan Budhwani", 
  "Samuel Fausto", "Sanne Smidt", "Sirak Tesfahunegn", "Solly Taub", 
  "Sophia Colley", "Tarek Aried", "Zhanna Paredes", "Zyanya Alarcon-Khorram"
];

// Week definitions
const WEEKS = [
  { week: 1, start: new Date('2025-10-13'), end: new Date('2025-10-19T23:59:59') },
  { week: 2, start: new Date('2025-10-20'), end: new Date('2025-10-26T23:59:59') },
  { week: 3, start: new Date('2025-10-27'), end: new Date('2025-11-02T23:59:59') },
  { week: 4, start: new Date('2025-11-03'), end: new Date('2025-11-09T23:59:59') },
  { week: 5, start: new Date('2025-11-10'), end: new Date('2025-11-16T23:59:59') }
];

// Find which pledge the user is searching for
function findPledge(searchTerm) {
  const search = searchTerm.toLowerCase().trim();
  
  // First try exact match on full name
  let match = PLEDGES.find(p => p.toLowerCase() === search);
  if (match) return match;
  
  // Try matching first name
  const firstNameMatches = PLEDGES.filter(p => {
    const firstName = p.split(' ')[0].toLowerCase();
    return firstName === search || firstName.startsWith(search);
  });
  
  // If only one match, return it
  if (firstNameMatches.length === 1) return firstNameMatches[0];
  
  // If multiple matches, try to disambiguate with last name/initial
  if (firstNameMatches.length > 1) {
    // Check if search includes space (might have last name or initial)
    const parts = search.split(' ');
    if (parts.length > 1) {
      const lastPart = parts[parts.length - 1];
      const match = firstNameMatches.find(p => {
        const lastName = p.split(' ').slice(1).join(' ').toLowerCase();
        return lastName.startsWith(lastPart);
      });
      if (match) return match;
    }
    // Return first match if can't disambiguate
    return firstNameMatches[0];
  }
  
  // Try partial match anywhere in name
  return PLEDGES.find(p => p.toLowerCase().includes(search));
}

// Check if a pledge name appears in text and extract just their review
function findPledgeReview(pledgeName, messageText) {
  const textLower = messageText.toLowerCase();
  const [firstName, ...lastNameParts] = pledgeName.split(' ');
  const lastName = lastNameParts.join(' ');
  const lastInitial = lastName.charAt(0);
  
  // Check if this first name is shared by multiple pledges
  const duplicateFirstNames = PLEDGES.filter(p => 
    p.split(' ')[0].toLowerCase() === firstName.toLowerCase()
  );
  const hasDuplicateFirstName = duplicateFirstNames.length > 1;
  
  // Find where this pledge's name appears in the message
  let startIndex = -1;
  
  // Try different name formats to find the start position
  // 1. Full name (e.g., "Jack Martin")
  const fullNameIndex = textLower.indexOf(pledgeName.toLowerCase());
  if (fullNameIndex !== -1) {
    startIndex = fullNameIndex;
  }
  
  // 2. First + last initial (e.g., "Jack M")
  if (startIndex === -1) {
    const firstLastInitialIndex = textLower.indexOf(`${firstName.toLowerCase()} ${lastInitial.toLowerCase()}`);
    if (firstLastInitialIndex !== -1) {
      startIndex = firstLastInitialIndex;
    }
  }
  
  // 3. Just first name - but ONLY if there are no duplicate first names
  if (startIndex === -1 && !hasDuplicateFirstName) {
    const firstNameRegex = new RegExp(`\\b${firstName.toLowerCase()}\\b`, 'i');
    const match = firstNameRegex.exec(textLower);
    if (match) {
      startIndex = match.index;
    }
  }
  
  if (startIndex === -1) {
    return null; // Pledge not found in message
  }
  
  // Find the start of the line containing the name (go back to beginning of line)
  let lineStart = startIndex;
  while (lineStart > 0 && messageText[lineStart - 1] !== '\n') {
    lineStart--;
  }
  
  // Go back one more line to include the line above the name
  if (lineStart > 0) {
    let prevLineStart = lineStart - 1; // Skip the newline
    while (prevLineStart > 0 && messageText[prevLineStart - 1] !== '\n') {
      prevLineStart--;
    }
    lineStart = prevLineStart;
  }
  
  // Now find where the next different pledge name appears
  let endIndex = messageText.length;
  let nearestNextPledge = messageText.length;
  
  for (const otherPledge of PLEDGES) {
    if (otherPledge === pledgeName) continue; // Skip the same pledge
    
    const [otherFirstName, ...otherLastParts] = otherPledge.split(' ');
    const otherLastName = otherLastParts.join(' ');
    const otherLastInitial = otherLastName.charAt(0);
    
    // Check if other pledge has duplicate first name
    const otherDuplicates = PLEDGES.filter(p => 
      p.split(' ')[0].toLowerCase() === otherFirstName.toLowerCase()
    );
    const otherHasDuplicate = otherDuplicates.length > 1;
    
    // Look for other pledge names after our start position
    const textAfterStart = messageText.substring(startIndex + 1).toLowerCase();
    
    // Check for full name
    let otherIndex = textAfterStart.indexOf(otherPledge.toLowerCase());
    if (otherIndex !== -1) {
      otherIndex += startIndex + 1;
      if (otherIndex < nearestNextPledge) {
        nearestNextPledge = otherIndex;
      }
    }
    
    // Check for first + last initial
    otherIndex = textAfterStart.indexOf(`${otherFirstName.toLowerCase()} ${otherLastInitial.toLowerCase()}`);
    if (otherIndex !== -1) {
      otherIndex += startIndex + 1;
      if (otherIndex < nearestNextPledge) {
        nearestNextPledge = otherIndex;
      }
    }
    
    // Check for just first name - but ONLY if no duplicates
    if (!otherHasDuplicate) {
      const otherFirstRegex = new RegExp(`\\b${otherFirstName.toLowerCase()}\\b`, 'i');
      const otherMatch = otherFirstRegex.exec(textAfterStart);
      if (otherMatch) {
        otherIndex = otherMatch.index + startIndex + 1;
        if (otherIndex < nearestNextPledge) {
          nearestNextPledge = otherIndex;
        }
      }
    }
  }
  
  // Find the start of the line containing the next pledge (go back to beginning of that line)
  if (nearestNextPledge < messageText.length) {
    while (nearestNextPledge > lineStart && messageText[nearestNextPledge - 1] !== '\n') {
      nearestNextPledge--;
    }
    endIndex = nearestNextPledge;
  }
  
  // Extract just this pledge's review
  return messageText.substring(lineStart, endIndex).trim();
}

// Determine which week a message timestamp falls into
function getWeek(messageTimestamp) {
  // Convert Slack timestamp to JavaScript Date
  const messageDate = new Date(parseFloat(messageTimestamp) * 1000);
  
  for (const week of WEEKS) {
    if (messageDate >= week.start && messageDate <= week.end) {
      return week.week;
    }
  }
  
  return null; // Outside of defined weeks
}

// Slash command handler
app.command('/review', async ({ command, ack, respond, client }) => {
  await ack();
  
  const searchName = command.text.trim();
  
  if (!searchName) {
    await respond({
      text: 'Please provide a pledge name. Usage: `/review Sophia` or `/review Jack M`',
      response_type: 'ephemeral'
    });
    return;
  }
  
  try {
    // Find which pledge they're searching for
    const pledgeName = findPledge(searchName);
    
    if (!pledgeName) {
      await respond({
        text: `Could not find pledge matching "${searchName}". Try using their first name or full name.`,
        response_type: 'ephemeral'
      });
      return;
    }
    
    // Fetch messages from the review channel
    const result = await client.conversations.history({
      channel: REVIEW_CHANNEL_ID,
      limit: 1000
    });
    
    const messages = result.messages || [];
    const reviewsByWeek = {};
    
    // Search through messages for this pledge
    for (const message of messages) {
      const messageText = message.text || '';
      
      // Check if this pledge appears in the message and extract their specific review
      const pledgeReview = findPledgeReview(pledgeName, messageText);
      
      if (pledgeReview) {
        // Get the author's info
        let authorName = 'Unknown';
        if (message.user) {
          try {
            const userInfo = await client.users.info({ user: message.user });
            authorName = userInfo.user.real_name || userInfo.user.name || 'Unknown';
          } catch (e) {
            console.error('Error fetching user info:', e);
          }
        }
        
        // Determine which week this review is from (based on when message was sent)
        const week = getWeek(message.ts);
        
        if (week) {
          if (!reviewsByWeek[week]) {
            reviewsByWeek[week] = [];
          }
          
          reviewsByWeek[week].push({
            author: authorName,
            text: pledgeReview, // Use extracted review, not full message
            timestamp: message.ts
          });
        }
      }
    }
    
    // Check if any reviews found
    const weekNumbers = Object.keys(reviewsByWeek).map(Number).sort((a, b) => a - b);
    
    if (weekNumbers.length === 0) {
      await respond({
        text: `No reviews found for ${pledgeName}`,
        response_type: 'ephemeral'
      });
      return;
    }
    
    // Build the response
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `Found Reviews for ${pledgeName}`
        }
      }
    ];
    
    // Add reviews organized by week
    for (const weekNum of weekNumbers) {
      const reviews = reviewsByWeek[weekNum];
      const reviewerNames = reviews.map(r => r.author).join(', ');
      
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Week ${weekNum} Coffee Chats:*\n${reviewerNames}`
        }
      });
      
      blocks.push({ type: 'divider' });
      
      // Add each review for this week
      reviews.forEach((review, index) => {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${review.author}:*\n${review.text}`
          }
        });
        
        if (index < reviews.length - 1) {
          blocks.push({ type: 'divider' });
        }
      });
      
      // Add spacing between weeks
      if (weekNum !== weekNumbers[weekNumbers.length - 1]) {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: ' '
          }
        });
      }
    }
    
    // Add dismiss button
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Dismiss'
          },
          action_id: 'dismiss_reviews',
          style: 'danger'
        }
      ]
    });
    
    await respond({
      blocks: blocks,
      response_type: 'ephemeral'
    });
    
  } catch (error) {
    console.error('Error fetching reviews:', error);
    await respond({
      text: 'Sorry, there was an error searching for reviews. Please try again.',
      response_type: 'ephemeral'
    });
  }
});

// Handle dismiss button click
app.action('dismiss_reviews', async ({ ack, respond }) => {
  await ack();
  
  await respond({
    delete_original: true
  });
});

// Start the app
(async () => {
  await app.start();
  console.log('⚡️ Review Search Bot is running!');
})();
