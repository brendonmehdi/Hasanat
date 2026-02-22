// app/friends.tsx — Friends management screen
import { useState, useCallback } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    FlatList, Alert, ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
    useFriendsList, usePendingRequests,
    useSendFriendRequest, useAcceptFriendRequest,
    useDeclineFriendRequest, useRemoveFriend, useBlockUser,
} from '../src/hooks/useFriends';
import { COLORS } from '../src/constants';

// ─── Friend Request Row ────────────────────────────────────────
function RequestRow({
    request,
    onAccept,
    onDecline,
    loading,
}: {
    request: any;
    onAccept: (id: string) => void;
    onDecline: (id: string) => void;
    loading: boolean;
}) {
    const fromProfile = request.from_profile;
    const initial = (fromProfile?.display_name || fromProfile?.username || '?')[0].toUpperCase();

    return (
        <View style={styles.friendRow}>
            {fromProfile?.profile_photo_url ? (
                <Image source={{ uri: fromProfile.profile_photo_url }} style={styles.avatarImage} />
            ) : (
                <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initial}</Text>
                </View>
            )}
            <View style={styles.friendInfo}>
                <Text style={styles.friendName}>
                    {fromProfile?.display_name || fromProfile?.username}
                </Text>
                <Text style={styles.friendUsername}>@{fromProfile?.username}</Text>
            </View>
            <View style={styles.requestActions}>
                <TouchableOpacity
                    style={styles.acceptBtn}
                    onPress={() => onAccept(request.id)}
                    disabled={loading}
                >
                    <Text style={styles.acceptText}>Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.declineBtn}
                    onPress={() => onDecline(request.id)}
                    disabled={loading}
                >
                    <Text style={styles.declineText}>✕</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

// ─── Friend Row ────────────────────────────────────────────────
function FriendRow({
    friend,
    onRemove,
    onBlock,
}: {
    friend: any;
    onRemove: (id: string) => void;
    onBlock: (id: string) => void;
}) {
    const initial = (friend.display_name || friend.username || '?')[0].toUpperCase();

    const handleLongPress = () => {
        Alert.alert(
            friend.display_name || friend.username,
            'What would you like to do?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Remove Friend',
                    style: 'destructive',
                    onPress: () => onRemove(friend.id),
                },
                {
                    text: 'Block User',
                    style: 'destructive',
                    onPress: () => {
                        Alert.alert(
                            'Block User?',
                            'They won\'t be able to find or contact you. This also removes the friendship.',
                            [
                                { text: 'Cancel', style: 'cancel' },
                                { text: 'Block', style: 'destructive', onPress: () => onBlock(friend.id) },
                            ],
                        );
                    },
                },
            ],
        );
    };

    return (
        <TouchableOpacity
            style={styles.friendRow}
            onLongPress={handleLongPress}
            activeOpacity={0.7}
        >
            {friend.profile_photo_url ? (
                <Image source={{ uri: friend.profile_photo_url }} style={styles.avatarImage} />
            ) : (
                <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initial}</Text>
                </View>
            )}
            <View style={styles.friendInfo}>
                <Text style={styles.friendName}>
                    {friend.display_name || friend.username}
                </Text>
                <Text style={styles.friendUsername}>@{friend.username}</Text>
            </View>
        </TouchableOpacity>
    );
}

// ─── Main Screen ───────────────────────────────────────────────
export default function FriendsScreen() {
    const router = useRouter();
    const [usernameInput, setUsernameInput] = useState('');
    const [sending, setSending] = useState(false);

    const { data: friends, isLoading: friendsLoading } = useFriendsList();
    const { data: pending, isLoading: pendingLoading } = usePendingRequests();

    const sendRequest = useSendFriendRequest();
    const acceptRequest = useAcceptFriendRequest();
    const declineRequest = useDeclineFriendRequest();
    const removeFriend = useRemoveFriend();
    const blockUser = useBlockUser();

    const handleSendRequest = useCallback(async () => {
        const username = usernameInput.trim();
        if (!username) return;

        setSending(true);
        try {
            await sendRequest.mutateAsync({ username });
            Alert.alert('Request Sent! ✉️', `Friend request sent to @${username}.`);
            setUsernameInput('');
        } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to send request.');
        } finally {
            setSending(false);
        }
    }, [usernameInput, sendRequest]);

    const handleAccept = useCallback(async (requestId: string) => {
        try {
            await acceptRequest.mutateAsync({ requestId });
        } catch (error: any) {
            Alert.alert('Error', error.message);
        }
    }, [acceptRequest]);

    const handleDecline = useCallback(async (requestId: string) => {
        try {
            await declineRequest.mutateAsync({ requestId });
        } catch (error: any) {
            Alert.alert('Error', error.message);
        }
    }, [declineRequest]);

    const handleRemove = useCallback(async (friendId: string) => {
        try {
            await removeFriend.mutateAsync({ friendId });
        } catch (error: any) {
            Alert.alert('Error', error.message);
        }
    }, [removeFriend]);

    const handleBlock = useCallback(async (userId: string) => {
        try {
            await blockUser.mutateAsync({ userId });
        } catch (error: any) {
            Alert.alert('Error', error.message);
        }
    }, [blockUser]);

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Text style={styles.backBtn}>← Back</Text>
                </TouchableOpacity>
                <Text style={styles.title}>Friends</Text>
                <View style={{ width: 48 }} />
            </View>

            {/* Add Friend */}
            <View style={styles.addSection}>
                <TextInput
                    style={styles.addInput}
                    placeholder="Enter username to add..."
                    placeholderTextColor={COLORS.textMuted}
                    value={usernameInput}
                    onChangeText={setUsernameInput}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="send"
                    onSubmitEditing={handleSendRequest}
                />
                <TouchableOpacity
                    style={[styles.addBtn, !usernameInput.trim() && styles.addBtnDisabled]}
                    onPress={handleSendRequest}
                    disabled={!usernameInput.trim() || sending}
                >
                    {sending ? (
                        <ActivityIndicator color={COLORS.textInverse} size="small" />
                    ) : (
                        <Text style={styles.addBtnText}>Add</Text>
                    )}
                </TouchableOpacity>
            </View>

            <FlatList
                data={[]}
                renderItem={() => null}
                ListHeaderComponent={
                    <>
                        {/* Pending Requests */}
                        {pending && pending.length > 0 && (
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>
                                    Pending Requests ({pending.length})
                                </Text>
                                {pending.map((req) => (
                                    <RequestRow
                                        key={req.id}
                                        request={req}
                                        onAccept={handleAccept}
                                        onDecline={handleDecline}
                                        loading={acceptRequest.isPending || declineRequest.isPending}
                                    />
                                ))}
                            </View>
                        )}

                        {/* Friends List */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>
                                Your Friends ({friends?.length || 0})
                            </Text>

                            {friendsLoading ? (
                                <ActivityIndicator color={COLORS.accent} style={{ marginTop: 20 }} />
                            ) : friends && friends.length > 0 ? (
                                friends.map((f) => (
                                    <FriendRow
                                        key={f.id}
                                        friend={f}
                                        onRemove={handleRemove}
                                        onBlock={handleBlock}
                                    />
                                ))
                            ) : (
                                <View style={styles.emptyCard}>
                                    <Text style={styles.emptyEmoji}>👥</Text>
                                    <Text style={styles.emptyText}>
                                        No friends yet. Add someone by their username above!
                                    </Text>
                                </View>
                            )}
                        </View>

                        {/* Hint */}
                        <Text style={styles.hint}>
                            Long-press a friend to remove or block them.
                        </Text>
                    </>
                }
                contentContainerStyle={styles.listContent}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.bg },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, paddingVertical: 12,
    },
    backBtn: { fontFamily: 'Inter_500Medium', fontSize: 16, color: COLORS.accent },
    title: { fontFamily: 'Inter_700Bold', fontSize: 20, color: COLORS.textPrimary },

    // Add friend
    addSection: {
        flexDirection: 'row', paddingHorizontal: 20, paddingBottom: 16, gap: 10,
    },
    addInput: {
        flex: 1, fontFamily: 'Inter_400Regular', fontSize: 15, color: COLORS.textPrimary,
        backgroundColor: COLORS.bgInput, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
        borderWidth: 1, borderColor: COLORS.border,
    },
    addBtn: {
        backgroundColor: COLORS.accent, borderRadius: 12, paddingHorizontal: 20,
        justifyContent: 'center', alignItems: 'center',
    },
    addBtnDisabled: { opacity: 0.5 },
    addBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: COLORS.textInverse },

    listContent: { paddingHorizontal: 20, paddingBottom: 32 },

    section: { marginBottom: 24 },
    sectionTitle: {
        fontFamily: 'Inter_600SemiBold', fontSize: 16, color: COLORS.textPrimary, marginBottom: 12,
    },

    // Friend Row
    friendRow: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: COLORS.bgCard, borderRadius: 12, padding: 14,
        marginBottom: 8, borderWidth: 1, borderColor: COLORS.border,
    },
    avatar: {
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: COLORS.accentGlow, borderWidth: 1.5, borderColor: COLORS.accent,
        justifyContent: 'center', alignItems: 'center',
    },
    avatarText: { fontFamily: 'Inter_700Bold', fontSize: 18, color: COLORS.accent },
    avatarImage: {
        width: 44, height: 44, borderRadius: 22,
        borderWidth: 1.5, borderColor: COLORS.accent,
    },
    friendInfo: { flex: 1 },
    friendName: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: COLORS.textPrimary },
    friendUsername: { fontFamily: 'Inter_400Regular', fontSize: 13, color: COLORS.textSecondary, marginTop: 1 },

    // Request actions
    requestActions: { flexDirection: 'row', gap: 8 },
    acceptBtn: {
        backgroundColor: COLORS.green, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8,
    },
    acceptText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: COLORS.textInverse },
    declineBtn: {
        backgroundColor: COLORS.bgElevated, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8,
        borderWidth: 1, borderColor: COLORS.border,
    },
    declineText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: COLORS.textSecondary },

    // Empty state
    emptyCard: {
        backgroundColor: COLORS.bgCard, borderRadius: 16, padding: 32,
        borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', gap: 8,
    },
    emptyEmoji: { fontSize: 40 },
    emptyText: {
        fontFamily: 'Inter_400Regular', fontSize: 14, color: COLORS.textSecondary, textAlign: 'center',
    },

    hint: {
        fontFamily: 'Inter_400Regular', fontSize: 12, color: COLORS.textMuted, textAlign: 'center',
    },
});
