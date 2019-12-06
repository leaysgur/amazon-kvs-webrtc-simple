export async function fetchEndpoints({ kvClient, channelARN, role }) {
    const getSignalingChannelEndpointResponse = await kvClient
        .getSignalingChannelEndpoint({
            ChannelARN: channelARN,
            SingleMasterChannelEndpointConfiguration: {
                Protocols: ['WSS', 'HTTPS'],
                Role: role,
            },
        })
        .promise();

    const endpointsByProtocol = getSignalingChannelEndpointResponse.ResourceEndpointList.reduce((endpoints, endpoint) => {
        endpoints[endpoint.Protocol] = endpoint.ResourceEndpoint;
        return endpoints;
    }, {});

    return endpointsByProtocol;
}

export async function fetchTURNServers({ kvsChannelsClient, channelARN, region }) {
    const getIceServerConfigResponse = await kvsChannelsClient.getIceServerConfig({ ChannelARN: channelARN }).promise();

    const iceServers = [{ urls: `stun:stun.kinesisvideo.${region}.amazonaws.com:443` }];
    getIceServerConfigResponse.IceServerList.forEach(iceServer =>
        iceServers.push({
            urls: iceServer.Uris,
            username: iceServer.Username,
            credential: iceServer.Password,
        }),
    );

    return iceServers;
}
