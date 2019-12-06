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
        role: KVSWebRTC.Role.MASTER
    });
    console.log('[MASTER] Endpoints: ', endpointsByProtocol);

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
    console.log('[MASTER] ICE servers: ', iceServers);

    /*
     *
     * WebRTC part using signaling client
     *
     */
    const master = {
        localView: document.querySelector('video'),
        remoteViews: document.getElementById('remotes'),
        peerConnectionByClientId: {},
        localStream: null,
    };

    const signalingClient = new KVSWebRTC.SignalingClient({
        channelARN,
        channelEndpoint: endpointsByProtocol.WSS,
        role: KVSWebRTC.Role.MASTER,
        region: region,
        credentials: {
            accessKeyId,
            secretAccessKey,
        },
    });

    signalingClient.on('open', async () => {
        console.log('[MASTER] Connected to signaling service');

        master.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        master.localView.srcObject = master.localStream;
        master.localView.muted = true;
        await master.localView.play();
    });

    signalingClient.on('sdpOffer', async (offer, remoteClientId) => {
        console.log('[MASTER] Received SDP offer from client: ' + remoteClientId);

        // master connects to viewer 1:N(up to 10)
        // RTCPeerConnection is required for each viewer clients
        const peerConnection = new RTCPeerConnection({ iceServers });
        master.peerConnectionByClientId[remoteClientId] = peerConnection;

        peerConnection.addEventListener('icecandidate', ({ candidate }) => {
            if (candidate) {
                console.log('[MASTER] Sending ICE candidate to client: ' + remoteClientId);
                signalingClient.sendIceCandidate(candidate, remoteClientId);
            }
        });

        peerConnection.addEventListener('track', ({ track }) => {
            console.warn('[MASTER] Received remote track from client: ' + remoteClientId);
            const $media = document.createElement(track.kind);
            $media.srcObject = new MediaStream([track]);
            $media.play();
            master.remoteViews.append($media);
        });

        master.localStream.getTracks().forEach(track => peerConnection.addTrack(track, master.localStream));
        await peerConnection.setRemoteDescription(offer);

        console.log('[MASTER] Creating SDP answer for client: ' + remoteClientId);
        await peerConnection.setLocalDescription(
            await peerConnection.createAnswer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true,
            }),
        );

        console.log('[MASTER] Sending SDP answer to client: ' + remoteClientId);
        signalingClient.sendSdpAnswer(peerConnection.localDescription, remoteClientId);
    });

    signalingClient.on('iceCandidate', async (candidate, remoteClientId) => {
        console.log('[MASTER] Received ICE candidate from client: ' + remoteClientId);

        const peerConnection = master.peerConnectionByClientId[remoteClientId];
        peerConnection.addIceCandidate(candidate);
    });

    signalingClient.on('close', () => {
        console.log('[MASTER] Disconnected from signaling channel');
    });

    signalingClient.on('error', () => {
        console.error('[MASTER] Signaling client error');
    });

    console.log('[MASTER] Starting master connection');
    signalingClient.open();
})();
