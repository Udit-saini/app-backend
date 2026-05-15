# Dating App Backend API Handoff

Use this document for frontend integration.

## Base Setup

Replace these values before running curl commands:

```bash
BASE_URL="http://localhost:5000"
TOKEN="FIREBASE_ID_TOKEN"
TARGET_USER_ID="MONGO_USER_ID"
MATCH_ID="MONGO_MATCH_ID"
CONVERSATION_ID="MONGO_CONVERSATION_ID"
PUBLIC_ID="CLOUDINARY_PUBLIC_ID"
```

All protected APIs require:

```http
Authorization: Bearer FIREBASE_ID_TOKEN
```

The backend verifies the Firebase ID token. If the user does not exist yet, the auth middleware creates the user from Firebase claims.

## Health

### GET `/health`

Use: Check whether the API server is running.

```bash
curl -X GET "$BASE_URL/health"
```

Success response:

```json
{
  "success": true
}
```

## Auth

### POST `/api/auth/login`

Use: Login/bootstrap the authenticated user after Firebase login on frontend.

```bash
curl -X POST "$BASE_URL/api/auth/login" \
  -H "Authorization: Bearer $TOKEN"
```

Success response:

```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "...",
      "firebaseUid": "...",
      "email": "...",
      "name": "...",
      "isProfileCompleted": false
    }
  }
}
```

## Profile

### GET `/api/profile`

Use: Get current user's dating profile.

```bash
curl -X GET "$BASE_URL/api/profile" \
  -H "Authorization: Bearer $TOKEN"
```

### POST `/api/profile`

Use: Create current user's dating profile.

```bash
curl -X POST "$BASE_URL/api/profile" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Aarav",
    "gender": "male",
    "age": 26,
    "bio": "Coffee, travel, and good playlists.",
    "interests": ["music", "travel", "fitness"],
    "location": {
      "lat": 28.6139,
      "lng": 77.2090
    }
  }'
```

### PATCH `/api/profile`

Use: Update current user's profile. Only these fields are accepted: `name`, `gender`, `age`, `bio`, `interests`, `images`, `location`.

```bash
curl -X PATCH "$BASE_URL/api/profile" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "bio": "Updated bio",
    "interests": ["movies", "food", "travel"]
  }'
```

### POST `/api/profile/upload-photo`

Use: Upload one profile photo. Maximum 6 photos per profile.

```bash
curl -X POST "$BASE_URL/api/profile/upload-photo" \
  -H "Authorization: Bearer $TOKEN" \
  -F "image=@/absolute/path/to/photo.jpg"
```

### DELETE `/api/profile/photo/:publicId`

Use: Delete one profile photo by Cloudinary `publicId`.

```bash
curl -X DELETE "$BASE_URL/api/profile/photo/$PUBLIC_ID" \
  -H "Authorization: Bearer $TOKEN"
```

If `publicId` contains `/` or special characters, URL encode it on frontend.

### PUT `/api/profile/photo/set-primary`

Use: Set one uploaded photo as the primary profile photo.

```bash
curl -X PUT "$BASE_URL/api/profile/photo/set-primary" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "publicId": "profiles/example-photo-id"
  }'
```

## Discovery

### GET `/api/discovery/feed`

Use: Get discovery cards for swiping. Excludes current user, already swiped users, and active matches.

```bash
curl -X GET "$BASE_URL/api/discovery/feed" \
  -H "Authorization: Bearer $TOKEN"
```

Success response includes `swipeLimit`:

```json
{
  "success": true,
  "data": [],
  "swipeLimit": {
    "unlimited": false,
    "dailyLimit": 50,
    "usedToday": 12,
    "remainingToday": 38
  }
}
```

Premium users receive:

```json
{
  "unlimited": true,
  "dailyLimit": null,
  "usedToday": null,
  "remainingToday": null
}
```

## Likes And Swipes

### POST `/api/likes/action`

Use: Like or dislike another user. This is the swipe endpoint.

Free users are limited to 50 new swipes per UTC day. Premium users have unlimited swipes.

```bash
curl -X POST "$BASE_URL/api/likes/action" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "targetUserId": "'"$TARGET_USER_ID"'",
    "action": "like"
  }'
```

For dislike:

```bash
curl -X POST "$BASE_URL/api/likes/action" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "targetUserId": "'"$TARGET_USER_ID"'",
    "action": "dislike"
  }'
```

Success without match:

```json
{
  "success": true,
  "matched": false
}
```

Success with match:

```json
{
  "success": true,
  "matched": true,
  "matchId": "...",
  "user": {
    "name": "Priya",
    "image": "https://..."
  }
}
```

Free limit error:

```json
{
  "success": false,
  "message": "Daily swipe limit reached"
}
```

### GET `/api/likes/received`

Use: Show users who liked the current user.

Premium only. Free users receive `403`.

```bash
curl -X GET "$BASE_URL/api/likes/received" \
  -H "Authorization: Bearer $TOKEN"
```

## Matches

### GET `/api/matches`

Use: Get current user's active matches.

```bash
curl -X GET "$BASE_URL/api/matches" \
  -H "Authorization: Bearer $TOKEN"
```

### DELETE `/api/matches/:matchId`

Use: Unmatch a user. This deletes the match, related conversation, messages, and likes between both users.

```bash
curl -X DELETE "$BASE_URL/api/matches/$MATCH_ID" \
  -H "Authorization: Bearer $TOKEN"
```

## Chats

### GET `/api/chats/conversations`

Use: Get conversations for the current user.

```bash
curl -X GET "$BASE_URL/api/chats/conversations" \
  -H "Authorization: Bearer $TOKEN"
```

### GET `/api/chats/:conversationId/messages`

Use: Get all messages in a conversation.

```bash
curl -X GET "$BASE_URL/api/chats/$CONVERSATION_ID/messages" \
  -H "Authorization: Bearer $TOKEN"
```

### POST `/api/chats/send`

Use: Send a text message by REST API. Also emits `new_message` over Socket.IO if connected users joined the conversation room.

```bash
curl -X POST "$BASE_URL/api/chats/send" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "'"$CONVERSATION_ID"'",
    "text": "Hey, how are you?"
  }'
```

### POST `/api/chats/fcm-token`

Use: Save current device FCM token for push notifications.

```bash
curl -X POST "$BASE_URL/api/chats/fcm-token" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fcmToken": "DEVICE_FCM_TOKEN"
  }'
```

## Subscriptions

### POST `/api/subscription/verify`

Use: Verify Google Play purchase token on backend and activate premium.

Do not unlock premium on frontend until this API returns success.

```bash
curl -X POST "$BASE_URL/api/subscription/verify" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "purchaseToken": "GOOGLE_PLAY_PURCHASE_TOKEN",
    "productId": "premium_monthly"
  }'
```

Supported development product IDs:

```text
premium_monthly
premium_quarterly
premium_yearly
```

Success response:

```json
{
  "success": true,
  "plan": "premium",
  "status": "active",
  "productId": "premium_monthly",
  "expiryDate": "2026-06-15T00:00:00.000Z",
  "autoRenewing": true
}
```

### GET `/api/subscription/me`

Use: Get current user's subscription from backend.

Frontend should use this response to decide premium UI access, not local purchase state.

```bash
curl -X GET "$BASE_URL/api/subscription/me" \
  -H "Authorization: Bearer $TOKEN"
```

Example response:

```json
{
  "success": true,
  "subscription": {
    "plan": "premium",
    "status": "active",
    "productId": "premium_monthly",
    "platform": "android",
    "startDate": "2026-05-15T00:00:00.000Z",
    "expiryDate": "2026-06-15T00:00:00.000Z",
    "autoRenewing": true
  }
}
```

### POST `/api/subscription/cancel`

Use: Mark subscription as cancelled locally. This does not call Google cancel API.

```bash
curl -X POST "$BASE_URL/api/subscription/cancel" \
  -H "Authorization: Bearer $TOKEN"
```

## Socket.IO Chat

Socket URL:

```text
http://localhost:5000
```

Authentication options supported by backend:

```js
const socket = io(BASE_URL, {
  auth: {
    token: firebaseIdToken
  }
});
```

The backend also accepts token in query as `token` or in `Authorization: Bearer <token>` header.

### Event: `join_conversation`

Use: Join a conversation room before listening for new messages.

```js
socket.emit("join_conversation", conversationId, (ack) => {
  console.log(ack);
});
```

Success ack:

```json
{
  "success": true
}
```

### Event: `send_message`

Use: Send a text message over Socket.IO.

```js
socket.emit(
  "send_message",
  {
    "conversationId": "MONGO_CONVERSATION_ID",
    "text": "Hello"
  },
  (ack) => {
    console.log(ack);
  }
);
```

Success ack:

```json
{
  "success": true,
  "data": {
    "_id": "...",
    "conversationId": "...",
    "senderId": "...",
    "text": "Hello",
    "messageType": "text",
    "isSeen": false,
    "createdAt": "..."
  }
}
```

### Event: `new_message`

Use: Listen for new messages in joined conversations.

```js
socket.on("new_message", (message) => {
  console.log(message);
});
```

## Common Errors

### Missing or invalid Firebase token

```json
{
  "success": false,
  "message": "Authorization token missing or invalid format"
}
```

or:

```json
{
  "success": false,
  "message": "Invalid or expired token"
}
```

### Premium required

```json
{
  "success": false,
  "message": "Premium subscription required"
}
```

### Daily swipe limit reached

```json
{
  "success": false,
  "message": "Daily swipe limit reached"
}
```

## Frontend Integration Notes

- Firebase login happens on frontend first.
- Send the Firebase ID token as `Authorization: Bearer <token>` to every protected API.
- Use `/api/auth/login` after Firebase login to bootstrap the MongoDB user.
- Use `/api/subscription/me` after app start/login to decide whether to show premium UI.
- Use `/api/subscription/verify` after Google Play purchase completes. Do not trust frontend purchase state by itself.
- Free users can perform 50 new swipes per UTC day.
- Premium users can swipe without limit and can access `/api/likes/received`.
- For chat, load conversations by REST, join a conversation room by Socket.IO, then listen for `new_message`.
