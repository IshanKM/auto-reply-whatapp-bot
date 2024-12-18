const { Client } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const nodemailer = require("nodemailer");
require("dotenv").config();

const client = new Client();

let lastActivityTime = Date.now(); // Timestamp for your last activity
const inactivityThreshold = 4 * 60 * 60 * 1000; // 4 hours in milliseconds
const repliedUsers = new Set(); // Track users who have been replied to within the inactivity period

// Email setup
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL,
    pass: process.env.PASSWORD,
  },
});

// Generate QR Code for WhatsApp Web
client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
});

// Once client is ready
client.on("ready", () => {
  console.log("WhatsApp Bot is ready!");
});

// Update last activity time when a message is sent by you
client.on("message", (message) => {
  if (message.fromMe) {
    lastActivityTime = Date.now(); // Reset the last activity time
    repliedUsers.clear(); // Clear replied users set
  }
});

// Handle incoming messages
client.on("message", async (message) => {
  if (message.fromMe) return; // Ignore messages sent by yourself

  const currentTime = Date.now();

  // Check if inactivity threshold has passed
  if (currentTime - lastActivityTime < inactivityThreshold) return; // Do nothing if active

  // Check if this user has already been replied to
  if (repliedUsers.has(message.from)) return;

  // Add the user to replied set
  repliedUsers.add(message.from);

  // Send the initial reply
  const senderName = message._data.notifyName || "Unknown";
  const senderNumber = message.from.split("@")[0];
  await message.reply(
    `Hi ${
      senderName !== "Unknown" ? senderName : senderNumber
    }, I'm currently unavailable. Is this an emergency? Please reply with "Yes" or "No".`
  );

  // Listen for response from the same user
  const responseListener = async (response) => {
    if (response.from === message.from) {
      if (response.body.toLowerCase() === "yes") {
        // Ask for the reason/problem
        await client.sendMessage(
          message.from,
          "Please let me know the reason or problem, and I’ll report it as an emergency."
        );

        // Listen for the problem/reason
        const reasonListener = async (reasonMessage) => {
          if (reasonMessage.from === message.from) {
            const reason = reasonMessage.body;

            // Send an email notification with the reason/problem
            const mailOptions = {
              from: process.env.EMAIL,
              to: process.env.NOTIFY_EMAIL,
              subject: `Emergency Message from ${senderName}`,
              text: `Emergency message from ${senderName} (${senderNumber}):\n\nReason/Problem: ${reason}`,
            };

            try {
              await transporter.sendMail(mailOptions);
              client.sendMessage(
                message.from,
                "Your emergency has been reported. We will get back to you ASAP."
              );
            } catch (error) {
              console.error("Error sending email:", error);
              client.sendMessage(
                message.from,
                "Failed to report the emergency. Please try again."
              );
            }

            // Remove the listener for the reason
            client.removeListener("message", reasonListener);
          }
        };

        client.on("message", reasonListener); // Add the listener for the reason
      } else if (response.body.toLowerCase() === "no") {
        client.sendMessage(
          message.from,
          "Thank you! I’ll respond when I’m available."
        );
      }

      // Remove the initial response listener
      client.removeListener("message", responseListener);
    }
  };

  client.on("message", responseListener); // Add the listener for the response
});

// Initialize the client
client.initialize();
