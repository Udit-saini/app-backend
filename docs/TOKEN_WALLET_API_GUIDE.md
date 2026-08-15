# Token Wallet API Guide

This backend now uses profile token balance for paid app actions instead of daily free/premium limits.

Base URL examples use:

```bash
BASE_URL="http://localhost:5000"
ID_TOKEN="FIREBASE_ID_TOKEN"
ADMIN_API_KEY="YOUR_ADMIN_API_KEY"
```

Authenticated app APIs use:

```bash
Authorization: Bearer $ID_TOKEN
```

Admin APIs use:

```bash
X-Admin-Api-Key: $ADMIN_API_KEY
```

## Default Token Rules

| Activity | Config key | Default cost | Charged when |
|---|---:|---:|---|
| Like profile | `like_profile` | `2` | User sends a new `like`, or changes `dislike` to `like` |
| Dislike profile | `dislike_profile` | `0` | User sends a new `dislike`, or changes `like` to `dislike` |
| Direct message request | `direct_message` | `10` | User creates a new direct message request |
| Conversation message | `chat_message` | `2` | User sends each chat message through REST or socket |

Subscribed users receive the active plan's daily token grant. The backend credits it once per UTC day during login, wallet lookup, or the first token-checked action.

When balance is not enough, APIs return HTTP `402`:

```json
{
  "success": false,
  "message": "Not enough tokens. Please top up tokens to continue.",
  "code": "INSUFFICIENT_TOKENS",
  "requiredTokens": 10,
  "availableTokens": 4,
  "activityKey": "direct_message"
}
```

Flutter behavior: show the top-up/paywall screen when `code == "INSUFFICIENT_TOKENS"` or status code is `402`.

## App APIs

### Login

Screen: Splash/Login bootstrap

Use this to get `userId`, `isProfileCompleted`, today's `tokenBalance`, and the daily token grant details.

```bash
curl -X POST "$BASE_URL/api/auth/login" \
  -H "Authorization: Bearer $ID_TOKEN"
```

Response includes:

```json
{
  "success": true,
  "data": {
    "userId": "USER_ID",
    "isProfileCompleted": true,
    "tokenBalance": 100,
    "dailyTokenGrant": 100,
    "lastDailyTokenGrantAt": "2026-08-15T00:00:00.000Z",
    "lastDailyTokenGrantAmount": 100
  }
}
```

### Get Wallet

Screen: Profile, Wallet, Top-up, app header token badge

```bash
curl "$BASE_URL/api/tokens/me" \
  -H "Authorization: Bearer $ID_TOKEN"
```

Response:

```json
{
  "success": true,
  "data": {
    "tokenBalance": 100,
    "dailyTokenGrant": 100,
    "freeTokenGrant": 0,
    "lastDailyTokenGrantAt": "2026-08-15T00:00:00.000Z",
    "lastDailyTokenGrantAmount": 100,
    "costs": {
      "like_profile": { "label": "Like profile", "cost": 2, "isActive": true },
      "dislike_profile": { "label": "Dislike profile", "cost": 0, "isActive": true },
      "direct_message": { "label": "Direct message request", "cost": 10, "isActive": true },
      "chat_message": { "label": "Conversation message", "cost": 2, "isActive": true }
    }
  }
}
```

### Get Token Packs / Purchase Plans

Screen: Token top-up store

Use the existing subscription plans API. Each plan includes `tokenAmount`, which is the total token allowance across the plan duration. Tokens are credited daily using `limits.dailyTokenGrant`.

```bash
curl "$BASE_URL/api/subscription/plans"
```

Response excerpt:

```json
{
  "success": true,
  "data": {
    "plans": [
      {
        "productId": "premium_weekly",
        "title": "100 Tokens Daily - Weekly",
        "amount": 499,
        "currency": "INR",
        "tokenAmount": 700,
        "durationDays": 7,
        "limits": {
          "dailyTokenGrant": 100,
          "includedDays": 7,
          "includedTokens": 700,
          "maxNearbyRadiusKm": 100
        }
      }
    ]
  }
}
```

Flutter behavior:

- Show these plans on the top-up screen.
- Use `productId` with Google Play Billing.
- After Google Play returns `purchaseToken`, call the existing verify API below.

### Verify Purchase and Credit Tokens

Screen: Token top-up store after Google Play purchase success

This reuses the existing subscription verify endpoint. It activates the plan idempotently and credits today's daily token grant. The same `purchaseToken` cannot activate or credit twice.

```bash
curl -X POST "$BASE_URL/api/subscription/verify" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "premium_weekly",
    "purchaseToken": "GOOGLE_PLAY_PURCHASE_TOKEN"
  }'
```

Response:

```json
{
  "success": true,
  "plan": "premium",
  "status": "active",
  "productId": "premium_weekly",
  "expiryDate": "2026-08-22T00:00:00.000Z",
  "autoRenewing": true,
  "tokenPurchase": {
    "alreadyProcessed": false,
    "purchaseId": "PURCHASE_RECORD_ID",
    "productId": "premium_weekly",
    "tokenAmount": 700,
    "dailyTokenGrant": 100,
    "tokenBalance": 100
  }
}
```

Duplicate verify response:

```json
{
  "success": true,
  "tokenPurchase": {
    "alreadyProcessed": true,
    "productId": "premium_weekly",
    "tokenAmount": 700,
    "dailyTokenGrant": 100,
    "tokenBalance": 100
  }
}
```

Flutter behavior:

- On success, update local token balance from `tokenPurchase.tokenBalance`.
- If `alreadyProcessed` is true, do not show an error; treat it as a safe retry.
- If the API returns `400`, the product or purchase token is invalid.

### Discovery Feed

Screen: Home feed / swipe cards

This endpoint does not deduct tokens. It tells Flutter how many likes are possible with current balance.

```bash
curl "$BASE_URL/api/discovery/feed" \
  -H "Authorization: Bearer $ID_TOKEN"
```

Response includes:

```json
{
  "success": true,
  "data": [],
  "tokenWallet": {
    "tokenBalance": 100,
    "likeCost": 2,
    "remainingLikes": 50,
    "dislikeCost": 0,
    "remainingDislikes": null
  }
}
```

Flutter behavior:

- Show cards normally.
- Show token balance and remaining likes if desired.
- Do not deduct locally as source of truth; update local balance after `/api/likes/action`.

### Nearby Feed

Screen: Nearby profiles

This endpoint does not deduct tokens. Premium radius restriction was removed; max accepted radius remains `100 KM`.

```bash
curl "$BASE_URL/api/nearby/feed?radiusKm=50&minAge=18&maxAge=35" \
  -H "Authorization: Bearer $ID_TOKEN"
```

Response includes:

```json
{
  "success": true,
  "data": [],
  "tokenWallet": {
    "tokenBalance": 100,
    "likeCost": 2,
    "remainingLikes": 50,
    "dislikeCost": 0,
    "remainingDislikes": null
  }
}
```

### Like or Dislike a Profile

Screen: Home feed card buttons, Nearby card buttons

```bash
curl -X POST "$BASE_URL/api/likes/action" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "targetUserId": "TARGET_USER_ID",
    "action": "like"
  }'
```

Token behavior:

- `like`: deducts `like_profile` cost.
- `dislike`: deducts `dislike_profile` cost. Default is `0`, but admin can change it anytime.
- Duplicate same action: no extra token deduction because no new action is created.
- Change `dislike` to `like`: deducts `like_profile` cost.
- Change `like` to `dislike`: deducts `dislike_profile` cost.

Success response:

```json
{
  "success": true,
  "matched": false,
  "tokenCharge": {
    "charged": true,
    "activityKey": "like_profile",
    "cost": 2,
    "tokenBalance": 98
  }
}
```

Dislike success response with default `0` cost:

```json
{
  "success": true,
  "matched": false,
  "tokenCharge": {
    "charged": false,
    "activityKey": "dislike_profile",
    "cost": 0,
    "tokenBalance": 98
  }
}
```

Flutter behavior:

- If success and `tokenCharge.tokenBalance` exists, update local token badge.
- If `402/INSUFFICIENT_TOKENS`, stop swipe/like and open top-up UI.

### Received Likes

Screen: Likes received

Premium blur restriction was removed. This endpoint now returns full liker profile data.

```bash
curl "$BASE_URL/api/likes/received" \
  -H "Authorization: Bearer $ID_TOKEN"
```

Response:

```json
{
  "success": true,
  "shouldBlur": false,
  "data": [
    {
      "userId": "USER_ID",
      "name": "Aarav",
      "image": "https://example.com/profile.jpg",
      "shouldBlur": false,
      "user": {
        "_id": "USER_ID",
        "email": "aarav@example.com",
        "name": "Aarav",
        "isProfileCompleted": true
      },
      "profile": {
        "_id": "PROFILE_ID",
        "userId": "USER_ID",
        "name": "Aarav",
        "gender": "male",
        "images": []
      }
    }
  ]
}
```

### Send Direct Message Request

Screen: Profile detail direct-message button

```bash
curl -X POST "$BASE_URL/api/direct-messages/send" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "receiverId": "RECEIVER_USER_ID",
    "message": "Hi, I liked your profile."
  }'
```

Token behavior:

- Deducts `direct_message` cost after receiver and duplicate-pending checks pass.
- If the direct message cannot be created after charging, backend refunds automatically.

Success response:

```json
{
  "success": true,
  "message": "Direct message sent",
  "data": {
    "directMessageId": "DIRECT_MESSAGE_ID",
    "tokenCharge": {
      "charged": true,
      "activityKey": "direct_message",
      "cost": 10,
      "tokenBalance": 90
    }
  }
}
```

### Direct Message Remaining

Screen: Profile detail direct-message compose helper

This endpoint is kept for backward compatibility. It now returns token-based ability instead of daily limits.

```bash
curl "$BASE_URL/api/direct-messages/remaining" \
  -H "Authorization: Bearer $ID_TOKEN"
```

Response:

```json
{
  "success": true,
  "limit": 9,
  "used": 0,
  "remaining": 9
}
```

### Direct Message Inbox

Screen: Direct message requests inbox

```bash
curl "$BASE_URL/api/direct-messages/inbox" \
  -H "Authorization: Bearer $ID_TOKEN"
```

No token deduction.

Response:

```json
{
  "success": true,
  "data": [
    {
      "directMessageId": "DIRECT_MESSAGE_ID",
      "sender": {
        "userId": "SENDER_USER_ID",
        "name": "Sender",
        "gender": "male",
        "age": 28,
        "bio": "Short bio",
        "lookingFor": "relationship",
        "zodiac": "Leo",
        "height": 178,
        "religion": "Hindu",
        "interests": ["music", "travel"],
        "images": [],
        "location": null,
        "image": "https://example.com/profile.jpg"
      },
      "message": "Hi, I liked your profile.",
      "createdAt": "2026-08-14T00:00:00.000Z"
    }
  ]
}
```

### Direct Message Sent

Screen: Sent message requests

```bash
curl "$BASE_URL/api/direct-messages/sent" \
  -H "Authorization: Bearer $ID_TOKEN"
```

No token deduction.

Response:

```json
{
  "success": true,
  "data": [
    {
      "directMessageId": "DIRECT_MESSAGE_ID",
      "receiver": {
        "userId": "RECEIVER_USER_ID",
        "name": "Receiver",
        "gender": "female",
        "age": 26,
        "bio": "Short bio",
        "lookingFor": "relationship",
        "zodiac": "Aries",
        "height": 164,
        "religion": "Hindu",
        "interests": ["movies", "fitness"],
        "images": [],
        "location": null,
        "image": "https://example.com/profile.jpg"
      },
      "message": "Hi, I liked your profile.",
      "status": "pending",
      "conversationId": null,
      "createdAt": "2026-08-14T00:00:00.000Z",
      "updatedAt": "2026-08-14T00:00:00.000Z"
    }
  ]
}
```

### Accept Direct Message

Screen: Direct message request detail

```bash
curl -X POST "$BASE_URL/api/direct-messages/DIRECT_MESSAGE_ID/accept" \
  -H "Authorization: Bearer $ID_TOKEN"
```

No token deduction.

Response:

```json
{
  "success": true,
  "conversationId": "CONVERSATION_ID"
}
```

### Reject Direct Message

Screen: Direct message request detail

```bash
curl -X POST "$BASE_URL/api/direct-messages/DIRECT_MESSAGE_ID/reject" \
  -H "Authorization: Bearer $ID_TOKEN"
```

No token deduction.

Response:

```json
{
  "success": true
}
```

### Conversations List

Screen: Chat list

```bash
curl "$BASE_URL/api/chats/conversations" \
  -H "Authorization: Bearer $ID_TOKEN"
```

No token deduction.

Response:

```json
{
  "success": true,
  "data": [
    {
      "conversationId": "CONVERSATION_ID",
      "matchId": "MATCH_ID",
      "conversationType": "match",
      "otherUserId": "OTHER_USER_ID",
      "otherUser": {
        "_id": "PROFILE_ID",
        "userId": "OTHER_USER_ID",
        "name": "Aarav",
        "images": []
      },
      "lastMessage": "Hello!",
      "lastMessageAt": "2026-08-14T00:00:00.000Z",
      "lastMessageSenderId": "USER_ID",
      "otherUserProfile": {
        "_id": "PROFILE_ID",
        "userId": "OTHER_USER_ID",
        "name": "Aarav",
        "images": []
      }
    }
  ]
}
```

### Conversation Messages

Screen: Chat detail

```bash
curl "$BASE_URL/api/chats/CONVERSATION_ID/messages" \
  -H "Authorization: Bearer $ID_TOKEN"
```

No token deduction for reading.

Response:

```json
{
  "success": true,
  "data": [
    {
      "_id": "MESSAGE_ID",
      "conversationId": "CONVERSATION_ID",
      "senderId": "USER_ID",
      "text": "Hello!",
      "messageType": "text",
      "isSeen": false,
      "createdAt": "2026-08-14T00:00:00.000Z"
    }
  ]
}
```

### Send Chat Message - REST

Screen: Chat detail send button

```bash
curl -X POST "$BASE_URL/api/chats/send" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "CONVERSATION_ID",
    "text": "Hello!"
  }'
```

Token behavior:

- Deducts `chat_message` cost for every sent message.

Success response:

```json
{
  "success": true,
  "data": {
    "_id": "MESSAGE_ID",
    "conversationId": "CONVERSATION_ID",
    "senderId": "USER_ID",
    "text": "Hello!",
    "messageType": "text",
    "isSeen": false,
    "createdAt": "2026-08-14T00:00:00.000Z"
  },
  "tokenCharge": {
    "charged": true,
    "activityKey": "chat_message",
    "cost": 2,
    "tokenBalance": 88
  }
}
```

### Send Chat Message - Socket

Screen: Chat detail realtime send

Event:

```js
socket.emit(
  "send_message",
  {
    conversationId: "CONVERSATION_ID",
    text: "Hello!"
  },
  (ack) => {
    // ack.success
    // ack.data
    // ack.tokenCharge
  }
);
```

Insufficient token ack:

```json
{
  "success": false,
  "statusCode": 402,
  "code": "INSUFFICIENT_TOKENS",
  "message": "Not enough tokens. Please top up tokens to continue.",
  "requiredTokens": 2,
  "availableTokens": 0,
  "activityKey": "chat_message"
}
```

## Admin APIs

### List Token Costs

Admin panel: Tokens page

```bash
curl "$BASE_URL/api/tokens/admin/config" \
  -H "X-Admin-Api-Key: $ADMIN_API_KEY"
```

### Update Token Cost

Admin panel: Tokens page, Save button

```bash
curl -X PUT "$BASE_URL/api/tokens/admin/config/like_profile" \
  -H "X-Admin-Api-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "cost": 4,
    "label": "Like profile",
    "description": "Deducted when a user likes a profile.",
    "isActive": true
  }'
```

Use keys:

- `like_profile`
- `dislike_profile`
- `direct_message`
- `chat_message`

### Configure Three Recharge Plans

Admin panel: Subscription Plans page

Use the existing three Google Play products/plans as daily token subscriptions. `tokenAmount` is the full allowance across the plan duration; the backend credits `dailyTokenGrant` once per UTC day.

Example setup:

| Product / plan | Admin field | Default token amount |
|---|---:|---:|
| Weekly plan, 100/day | `tokenAmount` | `700` |
| Monthly plan, 100/day | `tokenAmount` | `3000` |
| Monthly plan, 150/day | `tokenAmount` | `4500` |

The admin can click the price/token button in the Subscription Plans table and update:

- `amount`
- `tokenAmount`
- `highAmount`
- `currency`

Equivalent API:

```bash
curl -X PUT "$BASE_URL/api/subscription/admin/plans/PLAN_ID" \
  -H "X-Admin-Api-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 3999,
    "tokenAmount": 700,
    "limits": {
      "dailyTokenGrant": 100,
      "includedDays": 7,
      "includedTokens": 700
    },
    "highAmount": 4999,
    "currency": "INR"
  }'
```

When Flutter buys that plan and calls `POST /api/subscription/verify`, the backend activates the subscription and credits that plan's daily grant for the current UTC day.

### Top Up User Tokens

Admin panel: Users table, Tokens > Manage

```bash
curl -X POST "$BASE_URL/api/tokens/admin/users/USER_ID/top-up" \
  -H "X-Admin-Api-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 100,
    "note": "Manual top-up"
  }'
```

### Set Exact User Token Balance

Admin panel: Users table, Tokens > Manage

```bash
curl -X PUT "$BASE_URL/api/tokens/admin/users/USER_ID/balance" \
  -H "X-Admin-Api-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "tokenBalance": 250,
    "note": "Support correction"
  }'
```

### User Token Ledger

Admin/debug screen

```bash
curl "$BASE_URL/api/tokens/admin/users/USER_ID/ledger?page=1&limit=50" \
  -H "X-Admin-Api-Key: $ADMIN_API_KEY"
```

## Existing Subscription APIs

These endpoints still exist and are now reused for token-pack purchases:

- `GET /api/subscription/plans`
- `POST /api/subscription/verify`
- `GET /api/subscription/me`
- `POST /api/subscription/cancel`
- `/api/subscription/admin/*`

Current token implementation no longer uses subscription premium status to block:

- Likes/swipes
- Direct message requests
- Chat messages
- Nearby extended radius
- Received likes reveal

Use `tokenAmount` on each plan to control how many tokens a purchase gives. Admin can edit plan JSON and set `tokenAmount` for each Google Play product.

## Backend Charging Points Implemented

| Backend path | Charged? | Activity key |
|---|---:|---|
| `POST /api/likes/action` with `action=like` | Yes | `like_profile` |
| `POST /api/likes/action` with `action=dislike` | Yes | `dislike_profile` |
| `POST /api/direct-messages/send` | Yes | `direct_message` |
| `POST /api/chats/send` | Yes | `chat_message` |
| Socket `send_message` | Yes | `chat_message` |
| `POST /api/subscription/verify` | Credits tokens | `google_play_purchase` |
| Feed/read/list APIs | No | N/A |

## Endpoints To Recheck If New Features Are Added

No currently known send/like/message endpoint was left uncharged. Recheck these areas if new APIs are added:

- Any future media message endpoint, such as image/audio/video chat messages.
- Any future super-like, boost, profile reveal, or rewind endpoint.
- Any future payment verification endpoint other than `/api/subscription/verify`.
