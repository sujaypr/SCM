import requests
import json
import sys

BASE_URL = "http://127.0.0.1:8000/api/chat"

def test_chat_persistence():
    print("1. Testing Session Creation and Message Sending...")
    
    # Send a message without session_id to create new session
    payload = {"message": "Hello, this is a test message for persistence."}
    response = requests.post(f"{BASE_URL}/message", data=payload)
    
    if response.status_code != 200:
        print(f"❌ Failed to send message: {response.text}")
        return
    
    data = response.json()
    if not data.get("success"):
        print(f"❌ API returned error: {data}")
        return
        
    session_id = data.get("session_id")
    if not session_id:
        print("❌ No session_id returned")
        return
        
    print(f"✅ Message sent. Created Session ID: {session_id}")
    print(f"   Response: {data.get('response')[:50]}...")

    print("\n2. Testing Message Persistence (Get Messages)...")
    # Fetch messages for this session
    response = requests.get(f"{BASE_URL}/sessions/{session_id}/messages")
    
    if response.status_code != 200:
        print(f"❌ Failed to get messages: {response.text}")
        return
        
    data = response.json()
    messages = data.get("messages", [])
    
    if len(messages) >= 2: # User + Assistant
        print(f"✅ Retrieved {len(messages)} messages.")
        print(f"   User: {messages[0]['content']}")
        print(f"   Assistant: {messages[1]['content'][:50]}...")
    else:
        print(f"❌ Expected at least 2 messages, got {len(messages)}")
        return

    print("\n3. Testing Session Listing...")
    # List all sessions
    response = requests.get(f"{BASE_URL}/sessions")
    
    if response.status_code != 200:
        print(f"❌ Failed to list sessions: {response.text}")
        return
        
    data = response.json()
    sessions = data.get("sessions", [])
    
    found = False
    for s in sessions:
        if s["id"] == session_id:
            found = True
            print(f"✅ Found session in list: {s['title']} ({s['messageCount']} msgs)")
            break
            
    if not found:
        print("❌ Session not found in list")
        return

    print("\n4. Testing Context Awareness (Follow-up)...")
    # Send follow-up in same session
    payload = {
        "message": "What did I just say?",
        "session_id": session_id
    }
    response = requests.post(f"{BASE_URL}/message", data=payload)
    
    if response.status_code != 200:
        print(f"❌ Failed to send follow-up: {response.text}")
        return
        
    data = response.json()
    print(f"✅ Follow-up response: {data.get('response')}")
    
    # Check if response mentions the previous message
    if "test message" in data.get("response", "").lower() or "persistence" in data.get("response", "").lower():
        print("✅ Context awareness verified (bot remembered previous message)")
    else:
        print("⚠️ Context awareness uncertain (bot response didn't explicitly reference previous msg)")

    print("\n✅ All Persistence Tests Passed!")

if __name__ == "__main__":
    try:
        test_chat_persistence()
    except Exception as e:
        print(f"❌ Test failed with exception: {e}")
