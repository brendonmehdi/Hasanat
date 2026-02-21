// app/(tabs)/feed.tsx — Iftar feed screen with posts, reactions, comments
import { useState, useCallback, useMemo } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet,
    FlatList, TextInput, Alert, ActivityIndicator,
    RefreshControl, Image, Modal, KeyboardAvoidingView, Platform,
    ActionSheetIOS,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useFeed, useReactToPost, useCommentOnPost, useCreatePost, usePostComments, useDeletePost } from '../../src/hooks/useFeed';
import { uploadToS3 } from '../../src/lib/s3';
import { useAuthStore } from '../../src/stores/authStore';
import { COLORS, REACTION_EMOJI, MAX_CAPTION_LENGTH, MAX_COMMENT_LENGTH } from '../../src/constants';
import type { ReactionType } from '../../src/types';

const REACTION_KEYS: ReactionType[] = ['like', 'heart', 'mashallah', 'fire'];

// ─── Time Ago Helper ───────────────────────────────────────────
function timeAgo(dateStr: string): string {
    const now = Date.now();
    const diff = now - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

// ─── Comment Sheet ─────────────────────────────────────────────
function CommentSheet({
    postId,
    visible,
    onClose,
}: {
    postId: string;
    visible: boolean;
    onClose: () => void;
}) {
    const { data: comments, isLoading } = usePostComments(postId);
    const addComment = useCommentOnPost();
    const [text, setText] = useState('');

    const handleSend = async () => {
        if (!text.trim()) return;
        try {
            await addComment.mutateAsync({ postId, content: text.trim() });
            setText('');
        } catch (err: any) {
            Alert.alert('Error', err.message);
        }
    };

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <KeyboardAvoidingView
                style={styles.modalOverlay}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <View style={styles.commentSheet}>
                    <View style={styles.commentHeader}>
                        <Text style={styles.commentTitle}>Comments</Text>
                        <TouchableOpacity onPress={onClose}>
                            <Text style={styles.closeBtn}>✕</Text>
                        </TouchableOpacity>
                    </View>

                    {isLoading ? (
                        <ActivityIndicator color={COLORS.accent} style={{ marginTop: 20 }} />
                    ) : (
                        <FlatList
                            data={comments || []}
                            keyExtractor={(c) => c.id}
                            renderItem={({ item }) => (
                                <View style={styles.commentRow}>
                                    <Text style={styles.commentAuthor}>
                                        {item.profile?.display_name || item.profile?.username}
                                    </Text>
                                    <Text style={styles.commentText}>{item.content}</Text>
                                    <Text style={styles.commentTime}>{timeAgo(item.created_at)}</Text>
                                </View>
                            )}
                            ListEmptyComponent={
                                <Text style={styles.noComments}>No comments yet. Be the first!</Text>
                            }
                            style={styles.commentList}
                        />
                    )}

                    <View style={styles.commentInput}>
                        <TextInput
                            style={styles.commentTextInput}
                            placeholder="Add a comment..."
                            placeholderTextColor={COLORS.textMuted}
                            value={text}
                            onChangeText={setText}
                            maxLength={MAX_COMMENT_LENGTH}
                            multiline
                        />
                        <TouchableOpacity
                            onPress={handleSend}
                            disabled={!text.trim() || addComment.isPending}
                            style={[styles.sendBtn, !text.trim() && { opacity: 0.4 }]}
                        >
                            {addComment.isPending ? (
                                <ActivityIndicator color={COLORS.accent} size="small" />
                            ) : (
                                <Text style={styles.sendBtnText}>Send</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

// ─── Post Card ─────────────────────────────────────────────────
function PostCard({ post, onComment, onDelete }: {
    post: any;
    onComment: (id: string) => void;
    onDelete: (id: string, imageKey?: string) => void;
}) {
    const userId = useAuthStore((s) => s.session?.user?.id);
    const reactToPost = useReactToPost();
    const isOwner = userId === post.user_id;

    const reactionCounts = useMemo(() => {
        const counts: Partial<Record<ReactionType, number>> = {};
        const myReactedTypes = new Set<string>();
        post.reactions?.forEach((r: any) => {
            counts[r.reaction as ReactionType] = (counts[r.reaction as ReactionType] || 0) + 1;
            if (r.user_id === userId) myReactedTypes.add(r.reaction);
        });
        return { counts, myReactedTypes };
    }, [post.reactions, userId]);

    const handleReact = (reaction: ReactionType) => {
        reactToPost.mutate({ postId: post.id, reaction });
    };

    const initial = (post.profile?.display_name || post.profile?.username || '?')[0].toUpperCase();

    return (
        <View style={styles.postCard}>
            {/* Author */}
            <View style={styles.postHeader}>
                <View style={styles.postAvatar}>
                    <Text style={styles.postAvatarText}>{initial}</Text>
                </View>
                <View style={styles.postAuthorInfo}>
                    <Text style={styles.postAuthorName}>
                        {post.profile?.display_name || post.profile?.username}
                    </Text>
                    <Text style={styles.postTime}>{timeAgo(post.created_at)}</Text>
                </View>
                {/* Delete button for own posts */}
                {isOwner && (
                    <TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() => onDelete(post.id, post.image_key)}
                    >
                        <Text style={styles.deleteBtnText}>🗑️</Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* Image */}
            <Image
                source={{ uri: post.image_url }}
                style={styles.postImage}
                resizeMode="cover"
            />

            {/* Caption */}
            {post.caption ? (
                <Text style={styles.postCaption}>{post.caption}</Text>
            ) : null}

            {/* Reactions */}
            <View style={styles.reactionRow}>
                {REACTION_KEYS.map((key) => {
                    const count = reactionCounts.counts[key] || 0;
                    const isMyReaction = reactionCounts.myReactedTypes.has(key);
                    return (
                        <TouchableOpacity
                            key={key}
                            style={[styles.reactionBtn, isMyReaction && styles.reactionBtnActive]}
                            onPress={() => handleReact(key)}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.reactionEmoji}>{REACTION_EMOJI[key]}</Text>
                            {count > 0 && (
                                <Text style={[
                                    styles.reactionCount,
                                    isMyReaction && styles.reactionCountActive,
                                ]}>
                                    {count}
                                </Text>
                            )}
                        </TouchableOpacity>
                    );
                })}

                {/* Comment button */}
                <TouchableOpacity
                    style={styles.commentBtnRow}
                    onPress={() => onComment(post.id)}
                >
                    <Text style={styles.reactionEmoji}>💬</Text>
                    {post.comment_count > 0 && (
                        <Text style={styles.reactionCount}>{post.comment_count}</Text>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
}

// ─── Main Feed Screen ──────────────────────────────────────────
export default function FeedScreen() {
    const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } = useFeed();
    const createPost = useCreatePost();
    const deletePost = useDeletePost();

    const [commentPostId, setCommentPostId] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    const posts = useMemo(() => data?.pages.flat() || [], [data]);

    // ─── Pick image source (Camera or Library) ──────────────
    const handleNewPost = useCallback(async () => {
        if (Platform.OS === 'ios') {
            ActionSheetIOS.showActionSheetWithOptions(
                {
                    options: ['Cancel', '📷 Take Photo', '🖼️ Choose from Library'],
                    cancelButtonIndex: 0,
                },
                (buttonIndex) => {
                    if (buttonIndex === 1) pickImage('camera');
                    if (buttonIndex === 2) pickImage('library');
                },
            );
        } else {
            // Android fallback
            Alert.alert('New Post', 'Choose an option', [
                { text: 'Cancel', style: 'cancel' },
                { text: '📷 Take Photo', onPress: () => pickImage('camera') },
                { text: '🖼️ Choose from Library', onPress: () => pickImage('library') },
            ]);
        }
    }, []);

    const pickImage = async (source: 'camera' | 'library') => {
        try {
            let result: ImagePicker.ImagePickerResult;

            if (source === 'camera') {
                const { status } = await ImagePicker.requestCameraPermissionsAsync();
                if (status !== 'granted') {
                    Alert.alert('Permission needed', 'Camera access is required to take photos.');
                    return;
                }
                result = await ImagePicker.launchCameraAsync({
                    allowsEditing: true,
                    aspect: [1, 1],
                    quality: 0.8,
                });
            } else {
                result = await ImagePicker.launchImageLibraryAsync({
                    mediaTypes: ['images'],
                    allowsEditing: true,
                    aspect: [1, 1],
                    quality: 0.8,
                });
            }

            if (result.canceled || !result.assets?.[0]) return;

            const asset = result.assets[0];
            const mimeType = asset.mimeType || 'image/jpeg';

            // Ask for caption — only post once via the callback
            promptForCaption(asset.uri, mimeType);
        } catch (err: any) {
            Alert.alert('Error', err.message || 'Could not select image.');
        }
    };

    const promptForCaption = (uri: string, contentType: string) => {
        if (Platform.OS === 'ios' && Alert.prompt) {
            Alert.prompt(
                'Add Caption',
                'Optional caption for your iftar meal',
                [
                    { text: 'Skip', onPress: () => doUpload(uri, contentType, undefined) },
                    { text: 'Post', onPress: (caption: string) => doUpload(uri, contentType, caption) },
                ],
                'plain-text',
            );
        } else {
            // Android: no Alert.prompt, just upload without caption
            doUpload(uri, contentType, undefined);
        }
    };

    const doUpload = async (uri: string, contentType: string, caption?: string) => {
        setUploading(true);
        try {
            const { objectKey, publicUrl } = await uploadToS3(uri, contentType, 'iftar');
            await createPost.mutateAsync({ imageKey: objectKey, imageUrl: publicUrl, caption });
            Alert.alert('Posted! 🍽️', 'Your iftar post has been shared with friends.');
        } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to upload post.');
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = (postId: string, imageKey?: string) => {
        Alert.alert(
            'Delete Post',
            'Are you sure you want to delete this post?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await deletePost.mutateAsync({ postId, imageKey });
                        } catch (err: any) {
                            Alert.alert('Error', err.message || 'Failed to delete post.');
                        }
                    },
                },
            ],
        );
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await refetch();
        setRefreshing(false);
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.title}>Iftar Feed 🍽️</Text>
                <TouchableOpacity
                    style={styles.newPostBtn}
                    onPress={handleNewPost}
                    disabled={uploading}
                >
                    {uploading ? (
                        <ActivityIndicator color={COLORS.textInverse} size="small" />
                    ) : (
                        <Text style={styles.newPostBtnText}>+ Post</Text>
                    )}
                </TouchableOpacity>
            </View>

            {isLoading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator color={COLORS.accent} size="large" />
                </View>
            ) : (
                <FlatList
                    data={posts}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => (
                        <PostCard post={item} onComment={setCommentPostId} onDelete={(id, key) => handleDelete(id, key)} />
                    )}
                    contentContainerStyle={styles.listContent}
                    onEndReached={() => {
                        if (hasNextPage && !isFetchingNextPage) fetchNextPage();
                    }}
                    onEndReachedThreshold={0.5}
                    ListFooterComponent={
                        isFetchingNextPage ? (
                            <ActivityIndicator color={COLORS.accent} style={{ marginVertical: 20 }} />
                        ) : null
                    }
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyEmoji}>🍽️</Text>
                            <Text style={styles.emptyTitle}>No iftar posts yet</Text>
                            <Text style={styles.emptyText}>
                                Share what you're having for iftar!{'\n'}
                                Tap "+ Post" to upload a photo.
                            </Text>
                        </View>
                    }
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />
                    }
                />
            )}

            {/* Comment Modal */}
            {commentPostId && (
                <CommentSheet
                    postId={commentPostId}
                    visible={!!commentPostId}
                    onClose={() => setCommentPostId(null)}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.bg },

    header: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12,
    },
    title: {
        fontFamily: 'Inter_700Bold', fontSize: 24, color: COLORS.textPrimary, letterSpacing: -0.5,
    },
    newPostBtn: {
        backgroundColor: COLORS.accent, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8,
    },
    newPostBtnText: {
        fontFamily: 'Inter_600SemiBold', fontSize: 14, color: COLORS.textInverse,
    },

    listContent: { paddingHorizontal: 20, paddingBottom: 32 },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    // Post Card
    postCard: {
        backgroundColor: COLORS.bgCard, borderRadius: 16,
        borderWidth: 1, borderColor: COLORS.border, marginBottom: 16, overflow: 'hidden',
    },
    postHeader: {
        flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14,
    },
    postAvatar: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: COLORS.accentGlow, borderWidth: 1.5, borderColor: COLORS.accent,
        justifyContent: 'center', alignItems: 'center',
    },
    postAvatarText: { fontFamily: 'Inter_700Bold', fontSize: 14, color: COLORS.accent },
    postAuthorInfo: { flex: 1 },
    postAuthorName: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: COLORS.textPrimary },
    postTime: { fontFamily: 'Inter_400Regular', fontSize: 12, color: COLORS.textMuted, marginTop: 1 },

    deleteBtn: {
        padding: 6,
    },
    deleteBtnText: { fontSize: 18 },

    postImage: { width: '100%', aspectRatio: 1, backgroundColor: COLORS.bgElevated },

    postCaption: {
        fontFamily: 'Inter_400Regular', fontSize: 14, color: COLORS.textPrimary,
        paddingHorizontal: 14, paddingTop: 10, lineHeight: 20,
    },

    // Reactions
    reactionRow: {
        flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 10, gap: 4,
    },
    reactionBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 3,
        paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8,
        backgroundColor: COLORS.bgElevated,
    },
    reactionBtnActive: {
        backgroundColor: COLORS.accentGlow, borderWidth: 1, borderColor: COLORS.accent,
    },
    reactionEmoji: { fontSize: 16 },
    reactionCount: { fontFamily: 'Inter_500Medium', fontSize: 12, color: COLORS.textSecondary },
    reactionCountActive: { color: COLORS.accent },
    commentBtnRow: {
        flexDirection: 'row', alignItems: 'center', gap: 3,
        paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8,
        backgroundColor: COLORS.bgElevated, marginLeft: 'auto',
    },

    // Empty
    emptyContainer: {
        flex: 1, justifyContent: 'center', alignItems: 'center',
        paddingTop: 80, paddingHorizontal: 40,
    },
    emptyEmoji: { fontSize: 56, marginBottom: 16 },
    emptyTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, color: COLORS.textPrimary, marginBottom: 8 },
    emptyText: {
        fontFamily: 'Inter_400Regular', fontSize: 14, color: COLORS.textSecondary,
        textAlign: 'center', lineHeight: 22,
    },

    // Comment Modal
    modalOverlay: {
        flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)',
    },
    commentSheet: {
        backgroundColor: COLORS.bgCard, borderTopLeftRadius: 20, borderTopRightRadius: 20,
        maxHeight: '70%', paddingBottom: 16,
    },
    commentHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border,
    },
    commentTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, color: COLORS.textPrimary },
    closeBtn: { fontSize: 20, color: COLORS.textSecondary, padding: 4 },

    commentList: { paddingHorizontal: 20, paddingTop: 8 },
    commentRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
    commentAuthor: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: COLORS.accent },
    commentText: { fontFamily: 'Inter_400Regular', fontSize: 14, color: COLORS.textPrimary, marginTop: 2, lineHeight: 20 },
    commentTime: { fontFamily: 'Inter_400Regular', fontSize: 11, color: COLORS.textMuted, marginTop: 4 },
    noComments: {
        fontFamily: 'Inter_400Regular', fontSize: 14, color: COLORS.textMuted,
        textAlign: 'center', paddingVertical: 24,
    },

    commentInput: {
        flexDirection: 'row', alignItems: 'flex-end', gap: 8,
        paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border,
    },
    commentTextInput: {
        flex: 1, fontFamily: 'Inter_400Regular', fontSize: 14, color: COLORS.textPrimary,
        backgroundColor: COLORS.bgInput, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
        borderWidth: 1, borderColor: COLORS.border, maxHeight: 80,
    },
    sendBtn: { paddingVertical: 10, paddingHorizontal: 4 },
    sendBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: COLORS.accent },
});
