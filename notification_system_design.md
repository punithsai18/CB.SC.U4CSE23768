# Stage 1

## Core Actions
1. **Fetch Notifications**: Retrieve a paginated list of notifications for the currently logged-in user.
2. **Mark as Read**: Mark a specific notification as read.
3. **Mark All as Read**: Mark all of the user's unread notifications as read.
4. **Get Unread Count**: Retrieve the total number of unread notifications for the user.

## REST API Endpoints

### 1. Fetch Notifications
- **Description**: Retrieves a list of notifications for the logged-in user, ordered by creation date (newest first).
- **Method**: `GET`
- **Endpoint**: `/api/v1/notifications`
- **Headers**:
  - `Authorization: Bearer <token>`
  - `Accept: application/json`
- **Query Parameters**:
  - `page` (optional, integer): Page number for pagination. Default: 1.
  - `limit` (optional, integer): Number of items per page. Default: 20.
  - `status` (optional, string): Filter by status (`read`, `unread`).
- **Response (200 OK)**:
  ```json
  {
    "data": [
      {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "type": "alert",
        "title": "System Update",
        "message": "A new system update is available.",
        "status": "unread",
        "action_url": "https://example.com/updates",
        "created_at": "2026-05-06T10:00:00Z"
      }
    ],
    "meta": {
      "page": 1,
      "limit": 20,
      "total_count": 45,
      "total_pages": 3
    }
  }
  ```

### 2. Mark Notification as Read
- **Description**: Marks a specific notification as read.
- **Method**: `PATCH`
- **Endpoint**: `/api/v1/notifications/{id}/read`
- **Headers**:
  - `Authorization: Bearer <token>`
  - `Content-Type: application/json`
- **Path Parameters**:
  - `id` (string): The unique identifier of the notification.
- **Request Body**:
  *(Empty)*
- **Response (200 OK)**:
  ```json
  {
    "message": "Notification marked as read successfully.",
    "data": {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "status": "read",
      "updated_at": "2026-05-06T10:05:00Z"
    }
  }
  ```

### 3. Mark All Notifications as Read
- **Description**: Marks all unread notifications for the user as read.
- **Method**: `POST`
- **Endpoint**: `/api/v1/notifications/read-all`
- **Headers**:
  - `Authorization: Bearer <token>`
  - `Content-Type: application/json`
- **Request Body**:
  *(Empty)*
- **Response (200 OK)**:
  ```json
  {
    "message": "All notifications marked as read.",
    "updated_count": 5
  }
  ```

### 4. Get Unread Count
- **Description**: Retrieves the total count of unread notifications for the logged-in user.
- **Method**: `GET`
- **Endpoint**: `/api/v1/notifications/unread-count`
- **Headers**:
  - `Authorization: Bearer <token>`
  - `Accept: application/json`
- **Response (200 OK)**:
  ```json
  {
    "data": {
      "unread_count": 5
    }
  }
  ```

## Mechanism for Real-Time Notifications

To achieve real-time notifications when users are logged in, we will use **WebSockets**. WebSockets provide a persistent, bidirectional communication channel between the client and the server, making it highly efficient for low-latency, real-time data push.

### Implementation Details:
1. **Connection Establishment**:
   - The frontend establishes a secure WebSocket connection (`wss://`) immediately after a user successfully logs in.
   - Example endpoint: `wss://api.example.com/v1/notifications/stream?token=<jwt_token>`

2. **Authentication**:
   - The server authenticates the WebSocket connection using the provided token. If valid, the connection is kept open.

3. **Event Subscription**:
   - Upon connection, the backend subscribes the connection to a specific channel dedicated to that user (e.g., `user_notifs_<user_id>`). This is typically managed using an in-memory datastore or message broker like Redis Pub/Sub.

4. **Message Pushing**:
   - Whenever an event triggers a notification (e.g., a new message, system alert), the backend saves the notification to the database and simultaneously publishes the event to the user's specific channel.
   - The WebSocket server forwards the notification JSON payload down to the connected client.

5. **Client Handling**:
   - The frontend listens for incoming messages on the WebSocket connection.
   - When a new notification payload is received, the frontend updates the notification tray UI and increments the unread count dynamically, without requiring the user to refresh the page.

#### Example Real-Time Event Payload
```json
{
  "event_type": "notification_received",
  "payload": {
    "id": "123e4567-e89b-12d3-a456-426614174001",
    "type": "message",
    "title": "New Message",
    "message": "You have a new direct message.",
    "status": "unread",
    "action_url": "https://example.com/messages/1",
    "created_at": "2026-05-06T10:10:00Z"
  }
}
```

# Stage 2

## Storage Solution Suggestion
For reliably storing high volumes of notifications, **MongoDB (NoSQL)** is the recommended database.
- **Why MongoDB?**: Notifications are inherently unstructured or semi-structured data that evolve quickly. MongoDB provides horizontal scalability through sharding out-of-the-box, allowing the system to handle millions of reads/writes seamlessly. 
- **Challenges as Data Volume Increases**: 
  - **Storage Cost**: Storing millions of notifications per user leads to high storage costs and slower query performance.
  - **Write Bottleneck**: High throughput of concurrent notifications can lock or slow down databases.
- **Solutions**:
  - **TTL (Time-To-Live) Indexes**: Automatically delete or archive notifications older than 30 or 60 days.
  - **Sharding**: Distribute the database load across multiple servers using `studentID` as a shard key.

## DB Schema (MongoDB)
```json
// Collection: Notifications
{
  "_id": ObjectId("..."),
  "studentId": "student_1042",
  "notificationType": "Placement", // Event, Result, Placement
  "title": "New Placement Drive",
  "message": "Company X is hiring.",
  "isRead": false,
  "actionUrl": "https://example.com/drive",
  "createdAt": ISODate("2026-05-06T10:00:00Z")
}
```

## NoSQL Queries based on Stage 1
1. **Fetch Notifications**: `db.notifications.find({ studentId: "student_1042" }).sort({ createdAt: -1 }).skip(0).limit(20)`
2. **Mark as Read**: `db.notifications.updateOne({ _id: ObjectId("...") }, { $set: { isRead: true } })`
3. **Mark All as Read**: `db.notifications.updateMany({ studentId: "student_1042", isRead: false }, { $set: { isRead: true } })`
4. **Get Unread Count**: `db.notifications.countDocuments({ studentId: "student_1042", isRead: false })`

# Stage 3

## Query Analysis
The existing query: `SELECT * FROM notifications WHERE studentID = 1042 AND isRead = false ORDER BY createdAt ASC;`
- **Why is it slow?**: The database has grown to 5 million rows. Without an appropriate index covering `studentID`, `isRead`, and optionally `createdAt`, the database engine performs a **Full Table Scan** or a highly inefficient partial scan to filter and sort the rows.
- **Adding indexes to every column**: This is **ineffective and dangerous**. While it speeds up reads slightly for diverse queries, it severely degrades **write** performance (`INSERT`, `UPDATE`) because every index must be updated synchronously. It also massively inflates storage space.
- **What to change**: Add a **Composite Index** specifically on `(studentID, isRead, createdAt)`.
- **Computation Cost**: The read cost becomes `O(log N)` for tree traversal to find the student, followed by a quick sequential scan of the matching leaf nodes.

## Optimized Query
To find all students who got a placement notification in the last 7 days:
```sql
SELECT DISTINCT studentID
FROM notifications
WHERE notificationType = 'Placement' 
  AND createdAt >= NOW() - INTERVAL 7 DAY;
```

# Stage 4

## Problem & Solution
**Issue**: Fetching notifications on every page load overwhelms the DB.
**Solutions & Performance Improvement**:
1. **In-Memory Caching (Redis)**: Cache the unread notification count in Redis. On page load, the app only hits Redis for the count `GET unread_count:student_1042`, bypassing the database entirely.
   - *Tradeoff*: Requires managing cache invalidation (updating Redis whenever a new notification is generated or read), introducing slight system complexity.
2. **WebSockets (Push Model)**: Use the WebSocket mechanism defined in Stage 1 to push updates down. The frontend relies on its local state and only requests the full list from the backend occasionally.
   - *Tradeoff*: Maintaining thousands of concurrent WebSocket connections requires more server memory and infrastructure (like a load balancer supporting persistent connections).
3. **Cursor-based Pagination**: Fetching notifications should be lazy. Only load the top 10 on page load. Use cursor pagination rather than offset pagination to prevent slow queries on deep pages.
   - *Tradeoff*: Cursor pagination makes jumping to specific pages (e.g., page 5) difficult.

# Stage 5

## Flaws in the Pseudocode
1. **Synchronous Execution**: The `for` loop executes sequentially. Calling `send_email` and `save_to_db` for 50,000 students in one thread will block the server for hours and likely timeout the request.
2. **Lack of Fault Tolerance**: If `send_email` fails on student 200, the loop breaks or throws an exception, and the remaining 49,800 students receive nothing.
3. **Coupled DB and External API**: `save_to_db` (fast) and `send_email` (slow, network dependent) should **not** happen together synchronously. They should be decoupled.

## Redesign & Revised Pseudocode
The system should use an event-driven architecture with **Message Queues** (e.g., RabbitMQ, Kafka) and background worker services.
```python
function notify_all(student_ids: array, message: string):
    # 1. Bulk insert to DB (extremely fast, one query)
    bulk_save_to_db(student_ids, message)
    
    # 2. Publish to queues for async processing
    for student_id in student_ids:
        email_queue.publish({ student_id, message })
        push_queue.publish({ student_id, message })
    
    return "Notification dispatch started"

# Background Worker Process for Emails
function email_worker(job):
    try:
        send_email(job.student_id, job.message)
    except Exception as e:
        # Fails safely, sends to Dead Letter Queue (DLQ) or retries
        job.retry(max_attempts=3)
```

# Stage 6

## Priority Inbox Approach
To maintain a Priority Inbox displaying the top 10 most important unread notifications:
1. **Weighting Mechanism**: Assign weights based on `notificationType`: `Placement` (Weight: 3), `Result` (Weight: 2), `Event` (Weight: 1).
2. **Sorting Logic**: Sort the notifications first by `Weight` (descending), and secondarily by `Timestamp` (descending/newest first).
3. **Maintaining Top 'n' Continuously**: If this were a continuous stream in the backend, we would maintain a **Min-Heap (Bounded Priority Queue) of size 10** in memory or Redis. When a new notification arrives, we compare its priority to the lowest-priority item in the heap. If it's higher, we pop the lowest and insert the new one. This ensures maintaining the top 10 is an `O(log 10)` operation.