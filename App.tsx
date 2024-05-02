import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Button, ScrollView, StyleSheet, Platform, TouchableOpacity, SafeAreaView, KeyboardAvoidingView, Modal} from 'react-native';
import { Channel, Chat, Message, MixedTextTypedElement, TimetokenUtils, User, Membership, ThreadMessage } from "@pubnub/chat";

const userData = [
  {
    id: "support-agent",
    data: { name: "John (Support Agent)", custom: { initials: "SA", avatar: "#9fa7df" } },
  },
  {
    id: "supported-user",
    data: { name: "Mary Watson", custom: { initials: "MW", avatar: "#ffab91" } },
  },
]

const randomizedUsers = Math.random() < 0.5 ? userData : userData.reverse();

export default function App() {
  // const [user, setUser] = useState(null);
  // const [modalVisible, setModalVisible] = useState(true);

  // const handleUserSelection = (selectedUser) => {
  //   setUser(selectedUser);
  //   setModalVisible(false);
  // };
  const [chat, setChat] = useState<Chat>();
  const [text, setText] = useState<string>("");
  const [users, setUsers] = useState<User[]>([]);
  const [channel, setChannel] = useState<Channel>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [typers, setTypers] = useState("")
  const [membership, setMembership] = useState<undefined | Membership>()
  const [readReceipts, setReadReceipts] = useState({})
  const scrollViewRef = useRef<ScrollView>(null);

  async function handleSend() {
    if (!text || !channel) return;
    await channel.sendText(text);
    setText("");
  }

  async function handleMessage(message: Message) {
    if (chat && !users.find((user) => user.id === message.userId)) {
      const user = await chat.getUser(message.userId)
      if (user) setUsers((users) => [...users, user])
    }
    setMessages((messages) => [...messages, message])
  }

  async function handleToggleReaction(message, reaction) {
    const newMsg = await message.toggleReaction(reaction)
    setMessages((msgs) => msgs.map((msg) => (msg.timetoken === newMsg.timetoken ? newMsg : msg)))
  }
  
  async function markMessageRead(message: Message) { 
    await membership.setLastReadMessage(message)
  }


  useEffect(() => {
    const subscribeMessages = channel?.connect((message) => {
      setMessages((messages) => [...messages, message]);
    });
    return () => subscribeMessages && subscribeMessages();
  }, [channel]);

  useEffect(() => {
    if (!messages.length) return
    return ThreadMessage.streamUpdatesOn(messages, setMessages)
  }, [messages])

  useEffect(() => {
    async function initializeChat() {
      const chat = await Chat.init({
        publishKey: "pub-c-6a87a70f-ee1c-418e-8326-855fadb3af69",
        subscribeKey: "sub-c-73bd1dda-d8dc-4fef-8f97-0ea06c1bc2e0",
        userId: randomizedUsers[0].id,
        typingTimeout: 5000,
      });
      const currentUser = await chat.currentUser.update(randomizedUsers[0].data);
      const interlocutor = (await chat.getUser(randomizedUsers[1].id)) || (await chat.createUser(randomizedUsers[1].id, randomizedUsers[1].data));
      const { channel, hostMembership} = await chat.createDirectConversation({
        user: interlocutor,
        channelData: { name: "Support Channel" },
      });
      setChat(chat);
      setUsers([currentUser, interlocutor]);
      setMembership(hostMembership);
      setChannel(channel);

      channel.getTyping((data) => {
        //  Returns an array of typers (user IDs)
        let typers = ""
        if (data && data.length > 0) typers = "Typing: "
        data.forEach(async (typer) => {
          const typingUser = await chat.getUser(typer)
          typers += typingUser.name + " - "
          setTypers(typers)
        })
        setTypers(typers)
      })

      //  Retrieve 10 messages
      const channelHistory = await channel.getHistory({ count: 10 })

      const stopReceipts = await channel.streamReadReceipts((receipts) => {
        setReadReceipts(receipts)
      })

      //  Process each message using the same function which handles newly received messages
      channelHistory.messages.forEach(async (historicalMessage) => {
        await handleMessage(historicalMessage)
      })
    }

    initializeChat();
  }, []);

  const renderMessagePart = useCallback((messagePart: MixedTextTypedElement) => {
    if (messagePart.type === "text") {
      return <Text>{messagePart.content.text}</Text>;
    }
    if (messagePart.type === "plainLink") {
      return <Text style={styles.link}>{messagePart.content.link}</Text>;
    }
    if (messagePart.type === "textLink") {
      return <Text style={styles.link}>{messagePart.content.text}</Text>;
    }
    if (messagePart.type === "mention") {
      return <Text style={styles.mention}>{messagePart.content.name}</Text>;
    }
    return null;
  }, []);

  if (!chat || !channel) return <Text>Loading...</Text>;

  return (
  <SafeAreaView style={styles.safeArea}>
      {/* <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => {
          setModalVisible(false);
        }}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Choose User</Text>
            <View style={styles.buttonContainer}>
              <Button title="John" onPress={() => handleUserSelection(userData[0])} />
              <Button title="Mary" onPress={() => handleUserSelection(userData[1])} />
            </View>
          </View>
        </View>
      </Modal> */}
       <KeyboardAvoidingView 
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"} // "padding" is typically more effective on iOS
        keyboardVerticalOffset={Platform.OS === "ios" ? 16 : 0} // Adjust the value if needed for your app's header
      >
      <View style={styles.header}>
        <Text>{channel.name}</Text>
        <Text>{chat.currentUser.name}</Text>
      </View>
      <ScrollView ref={scrollViewRef} style={styles.messageList}>
        {messages.map((message) => {
          const user = users.find((user) => user.id === message.userId);
          return (
            <View key={message.timetoken} style={styles.message}>
              <View style={[styles.avatar, { backgroundColor: user?.custom?.avatar }]}>
                <Text>{user?.custom?.initials}</Text>
              </View>
                  <View style={styles.messageReactions}>
                    <Text>
                      {message.reactions["👍"] && message.reactions["👍"].length !== 0
                        ? "Reacted to by: "
                        : "Not reacted to"}
                    </Text>
                    {message.reactions["👍"]?.map((reaction) => (
                      <Text key={reaction.actionTimetoken} style={styles.reactionUser}>
                        {users.find((user) => user.id === reaction.uuid).name},{" "}
                      </Text>
                    ))}
                  </View>
                  <View style={styles.readReceipts}>
                    <Text>
                      {readReceipts[message.timetoken] ? "Read By: " : ""}
                      {readReceipts[message.timetoken]?.map((rec, index) => {
                        const userName = users.find((user) => user.id === rec)?.name || 'Unknown User';
                        return (
                          <Text key={index} style={styles.readReceiptUser}>
                            {userName},
                          </Text>
                        );
                      })}
                    </Text>
                  </View>
                  <View style={styles.messageContent}>
                    <Text>{user?.name}</Text>
                    <Text>
                      {TimetokenUtils.timetokenToDate(message.timetoken).toLocaleTimeString([], {
                        timeStyle: "short",
                      })}
                    </Text>
                    <Text>
                      {message.getLinkedText().map((messagePart: MixedTextTypedElement, i: number) => (
                        <Text key={i}>{renderMessagePart(messagePart)}</Text>
                      ))}
                    </Text>
                    <View style={styles.buttonContainer}>
                      <TouchableOpacity
                        onPress={() => handleToggleReaction(message, "👍")}
                        style={styles.reactionButton}
                      >
                        <Text style={styles.reactionButtonText}>
                          {message.hasUserReaction("👍") ? "Remove my reaction" : "React to this"}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={async () => await markMessageRead(message)}
                        style={styles.markReadButton}
                      >
                        <Text style={styles.markReadButtonText}>Mark Read</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
            </View>
          );
        })}
      </ScrollView>
      <View style={styles.typingIndicator}>
        <Text>{typers}</Text>
      </View>
      <View style={styles.inputSection}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={(newText) => {
            channel.startTyping();
            setText(newText)
          }}
          placeholder="Send message"
        />
        <Button title="Send" onPress={handleSend} disabled={!text} color="#de2440" />
      </View>
    </KeyboardAvoidingView>
  </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff'
  },
  container: {
    flex: 1
  },
  header: {
    padding: 20,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexDirection: 'row'
  },
  messageList: {
    flex: 1,
    backgroundColor: '#e5e5e5'
  },
  message: {
    flexDirection: 'column',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
    alignItems: 'flex-start'
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 5
  },
  messageContent: {
    flex: 1,
    marginBottom: 5
  },
  inputSection: {
    flexDirection: 'row',
    padding: 10
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    marginRight: 10
  },
  link: {
    color: 'blue'
  },
  mention: {
    color: 'purple'
  },
  typingIndicator: {
    padding: 10,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center'
  },
  buttonContainer: {
    flexDirection: 'row', // Align buttons in a row
    justifyContent: 'space-between', // Space out buttons evenly
    width: '100%', // Ensure the container takes the full width
  },
  reactionButton: {
    backgroundColor: '#de2440',
    flex: 1, // Take equal space in the flex container
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 5,
    margin: 5
  },
  reactionButtonText: {
    color: '#ffffff',
    fontSize: 16
  },
  markReadButton: {
    backgroundColor: '#4CAF50',
    flex: 1, // Take equal space in the flex container
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 5,
    margin: 5
  },
  markReadButtonText: {
    color: '#ffffff',
    fontSize: 16,
    textAlign: 'center'
  },
  messageReactions: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    marginTop: 5
  },
  reactionUser: {
    color: '#000',
    marginRight: 5
  },
  readReceipts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 5,
    marginBottom: 5,
  },
  readReceiptUser: {
    color: '#000',
    marginRight: 5,
  },
});