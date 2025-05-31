// server.js
const WebSocket = require('ws');
const http = require('http');
const uuid = require('uuid');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

const rooms = new Map(); // roomId -> { clients, name, messages }

wss.on('connection', (ws) => {
  ws.id = uuid.v4();
  console.log(`New client connected: ${ws.id}`);

  ws.on('message', (data) => {
    const message = JSON.parse(data);
    handleMessage(ws, message);
  });

  ws.on('close', () => {
    console.log(`Client disconnected: ${ws.id}`);
    // 클라이언트가 속한 모든 방에서 제거
    rooms.forEach((room, roomId) => {
      if (room.clients.has(ws)) {
        room.clients.delete(ws);
        broadcastSystemMessage(roomId, `${ws.username}님이 방을 떠났습니다.`);
        
        // 방이 비었으면 삭제
        if (room.clients.size === 0) {
          rooms.delete(roomId);
        }
      }
    });
  });
});

function handleMessage(ws, message) {
  switch (message.type) {
    case 'set_username':
      ws.username = message.username;
      break;
      
    case 'create_room':
      createRoom(ws, message.roomName);
      break;
      
    case 'join_room':
      joinRoom(ws, message.roomId);
      break;
      
    case 'chat_message':
      broadcastChatMessage(ws, message.roomId, message.content);
      break;
      
    case 'edit_room_name':
      editRoomName(ws, message.roomId, message.newName);
      break;
      
    case 'delete_room':
      deleteRoom(ws, message.roomId);
      break;
  }
}

function createRoom(ws, roomName) {
  const roomId = uuid.v4().substr(0, 8); // 8자리 짧은 ID
  const inviteCode = Math.floor(1000 + Math.random() * 9000).toString(); // 4자리 초대 코드
  
  const room = {
    id: roomId,
    name: roomName,
    inviteCode,
    clients: new Set([ws]),
    messages: [
      {
        user: '시스템',
        content: `${ws.username}님이 방을 생성했습니다.`,
        timestamp: new Date().toISOString()
      }
    ]
  };
  
  rooms.set(roomId, room);
  
  ws.send(JSON.stringify({
    type: 'room_created',
    roomId,
    roomName,
    inviteCode,
    messages: room.messages
  }));
  
  console.log(`Room created: ${roomId} (${roomName})`);
}

function joinRoom(ws, roomId) {
  const room = rooms.get(roomId);
  if (!room) {
    ws.send(JSON.stringify({
      type: 'error',
      message: '방을 찾을 수 없습니다. 초대 코드를 확인해주세요.'
    }));
    return;
  }
  
  // 이미 참여한 방인지 확인
  if (room.clients.has(ws)) {
    return;
  }
  
  room.clients.add(ws);
  
  // 시스템 메시지 추가
  const systemMessage = {
    user: '시스템',
    content: `${ws.username}님이 방에 참여했습니다.`,
    timestamp: new Date().toISOString()
  };
  room.messages.push(systemMessage);
  
  // 새 참여자에게 방 정보 전송
  ws.send(JSON.stringify({
    type: 'room_joined',
    roomId: room.id,
    roomName: room.name,
    messages: room.messages
  }));
  
  // 다른 참여자들에게 알림
  broadcastSystemMessage(roomId, systemMessage.content);
  
  console.log(`${ws.username} joined room ${roomId}`);
}

function broadcastChatMessage(ws, roomId, content) {
  const room = rooms.get(roomId);
  if (!room || !room.clients.has(ws)) return;
  
  const chatMessage = {
    user: ws.username,
    content,
    timestamp: new Date().toISOString()
  };
  
  room.messages.push(chatMessage);
  
  // 모든 클라이언트에 메시지 전송
  const messageToSend = JSON.stringify({
    type: 'chat_message',
    ...chatMessage
  });
  
  room.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageToSend);
    }
  });
}

function broadcastSystemMessage(roomId, content) {
  const room = rooms.get(roomId);
  if (!room) return;
  
  const systemMessage = {
    user: '시스템',
    content,
    timestamp: new Date().toISOString()
  };
  
  room.messages.push(systemMessage);
  
  const messageToSend = JSON.stringify({
    type: 'system_message',
    ...systemMessage
  });
  
  room.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageToSend);
    }
  });
}

function editRoomName(ws, roomId, newName) {
  const room = rooms.get(roomId);
  if (!room || !room.clients.has(ws)) return;
  
  room.name = newName;
  
  const systemMessage = {
    user: '시스템',
    content: `방 이름이 "${newName}"(으)로 변경되었습니다.`,
    timestamp: new Date().toISOString()
  };
  
  room.messages.push(systemMessage);
  
  const messageToSend = JSON.stringify({
    type: 'room_updated',
    roomId,
    roomName: newName,
    systemMessage
  });
  
  room.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageToSend);
    }
  });
}

function deleteRoom(ws, roomId) {
  const room = rooms.get(roomId);
  if (!room || !room.clients.has(ws)) return;
  
  // 모든 클라이언트에게 방 삭제 알림
  const messageToSend = JSON.stringify({
    type: 'room_deleted',
    roomId
  });
  
  room.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageToSend);
    }
  });
  
  rooms.delete(roomId);
}

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
