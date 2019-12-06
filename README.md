# amazon-kvs-webrtc-simple

Simple minimum demo app using `amazon-kinesis-video-streams-webrtc-sdk-js`.
(It just splits official example into master and viewer app.)

## How to try

- Create signaling channel and IAM on your AWS dashboard
  - Fill it in `/src/config.js`
- Run HTTP Server from root directory
- Open `master.html`
- Then open `viewer.html`
  - It seems ~10 viewers are available

See also https://github.com/awslabs/amazon-kinesis-video-streams-webrtc-sdk-js

Since this SDK does not provide wrapper for WebRTC specific APIs, you may need some library like [simple-p2p](https://github.com/leader22/simple-p2p) instead.
