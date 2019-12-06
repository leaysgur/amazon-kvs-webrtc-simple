import { channelARN, accessKeyId, secretAccessKey, region } from './config.js';
import { fetchEndpoints, fetchTURNServers } from "./shared.js";

(async () => {
    /*
     *
     * Setup part for AWS kinesis, signaling clients
     *
     */
    const kvClient = new AWS.KinesisVideo({
        region,
        accessKeyId,
        secretAccessKey,
    });

    const endpointsByProtocol = await fetchEndpoints({
        kvClient,
        channelARN,
        role: KVSWebRTC.Role.VIEWER
    });
    console.log('[VIEWER] Endpoints: ', endpointsByProtocol);

    // if use STUN/TURN
    const kvsChannelsClient = new AWS.KinesisVideoSignalingChannels({
        region,
        accessKeyId,
        secretAccessKey,
        endpoint: endpointsByProtocol.HTTPS,
    });
    const iceServers = await fetchTURNServers({
        kvsChannelsClient,
        channelARN,
        region,
    });
    console.log('[VIEWER] ICE servers: ', iceServers);

    /*
     *
     * WebRTC part using signaling client
     *
     */
    const localView = document.querySelectorAll('video')[0];
    const remoteView = document.querySelectorAll('video')[1];

    const signalingClient = new KVSWebRTC.SignalingClient({
        channelARN,
        channelEndpoint: endpointsByProtocol.WSS,
        clientId: `c${Date.now()}`, // should be random
        role: KVSWebRTC.Role.VIEWER,
        region,
        credentials: {
            accessKeyId: accessKeyId,
            secretAccessKey: secretAccessKey,
        },
    });

    // viewer connects to master 1:1
    const peerConnection = new RTCPeerConnection({ iceServers });

    signalingClient.on('open', async () => {
        console.log('[VIEWER] Connected to signaling service');

        const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
        localView.srcObject = localStream;
        localView.muted = true;
        await localView.play();

        console.log('[VIEWER] Creating SDP offer');
        await peerConnection.setLocalDescription(
            await peerConnection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true,
            }),
        );

        console.log('[VIEWER] Sending SDP offer');
        signalingClient.sendSdpOffer(peerConnection.localDescription);
    });

    signalingClient.on('sdpAnswer', async answer => {
        console.log('[VIEWER] Received SDP answer');
        await peerConnection.setRemoteDescription(answer);
    });

    signalingClient.on('iceCandidate', candidate => {
        console.log('[VIEWER] Received ICE candidate');
        peerConnection.addIceCandidate(candidate);
    });

    signalingClient.on('close', () => {
        console.log('[VIEWER] Disconnected from signaling channel');
    });

    signalingClient.on('error', error => {
        console.error('[VIEWER] Signaling client error: ', error);
    });

    // Send any ICE candidates to the other peer
    peerConnection.addEventListener('icecandidate', ({ candidate }) => {
        if (candidate) {
            console.log('[VIEWER] Sending ICE candidate');
            signalingClient.sendIceCandidate(candidate);
        }
    });

    // As remote tracks are received, add them to the remote view
    peerConnection.addEventListener('track', event => {
        console.log('[VIEWER] Received remote track');
        if (remoteView.srcObject) {
            return;
        }
        remoteView.srcObject = event.streams[0];
        remoteView.play();
    });

    console.log('[VIEWER] Starting viewer connection');
    signalingClient.open();
})();
