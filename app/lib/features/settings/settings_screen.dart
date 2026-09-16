import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models.dart';
import '../../core/providers.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../subscription/subscription_screen.dart';

/// Account settings. Hosts the notification preferences entry point and the
/// sign-out action.
class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(myProfileProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('You')),
      body: AsyncView(
        value: profile,
        onRetry: () => ref.invalidate(myProfileProvider),
        builder: (me) => ListView(
          children: [
            ListTile(
              leading: SizedBox.square(
                dimension: 48,
                child: ClipOval(
                  child: ProfilePhoto(url: me.primaryPhoto, label: 'Your profile photo'),
                ),
              ),
              title: Text(me.name ?? 'Your profile'),
              subtitle: Text(
                me.verification.isVerified ? 'Verified' : 'Verification pending',
              ),
              trailing: VerificationBadge(status: me.verification),
            ),
            const Divider(),

            ListTile(
              leading: const Icon(Icons.workspace_premium_outlined),
              title: const Text('Subscription'),
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const SubscriptionScreen()),
              ),
            ),
            ListTile(
              leading: const Icon(Icons.notifications_outlined),
              title: const Text('Notification preferences'),
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const NotificationPrefsScreen()),
              ),
            ),
            const Divider(),
            ListTile(
              leading: const Icon(Icons.logout),
              title: const Text('Sign out'),
              onTap: () => ref.read(firebaseAuthProvider).signOut(),
            ),
            const SizedBox(height: Tokens.spaceLg),
          ],
        ),
      ),
    );
  }
}

/// Spec 1.2 — per-category toggles, expected by both app stores.
class NotificationPrefsScreen extends ConsumerWidget {
  const NotificationPrefsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final prefs = ref.watch(notificationPrefsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Notifications')),
      body: AsyncView(
        value: prefs,
        onRetry: () => ref.invalidate(notificationPrefsProvider),
        builder: (value) {
          final notifier = ref.read(notificationPrefsProvider.notifier);

          // One row per category; the toggle writes through to the API.
          Widget row(String title, String subtitle, bool on, NotificationPrefs Function(bool) update) =>
              SwitchListTile(
                title: Text(title),
                subtitle: Text(subtitle),
                value: on,
                onChanged: (next) => notifier.set(update(next)),
              );

          return ListView(
            children: [
              row('New likes', 'When someone likes your profile', value.newLike,
                  (v) => value.copyWith(newLike: v)),
              row('New matches', 'When a like becomes a match', value.newMatch,
                  (v) => value.copyWith(newMatch: v)),
              row('Messages', 'When a match sends you a message', value.newMessage,
                  (v) => value.copyWith(newMessage: v)),
              const Divider(),
              row('Tips and offers', 'Occasional product news from Rishta', value.marketing,
                  (v) => value.copyWith(marketing: v)),
              const Padding(
                padding: EdgeInsets.all(Tokens.spaceMd),
                child: _PushRegistrationTile(),
              ),
            ],
          );
        },
      ),
    );
  }
}

/// Registers this device's FCM token so the server can target it. Spec 2.1 —
/// push is triggered server-side from like/match/message events.
class _PushRegistrationTile extends ConsumerStatefulWidget {
  const _PushRegistrationTile();

  @override
  ConsumerState<_PushRegistrationTile> createState() => _PushRegistrationTileState();
}

class _PushRegistrationTileState extends ConsumerState<_PushRegistrationTile> {
  String? _status;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _register());
  }

  Future<void> _register() async {
    try {
      final messaging = FirebaseMessaging.instance;
      final settings = await messaging.requestPermission();
      if (settings.authorizationStatus == AuthorizationStatus.denied) {
        if (mounted) setState(() => _status = 'Notifications are turned off in system settings.');
        return;
      }

      final isIos = defaultTargetPlatform == TargetPlatform.iOS;
      final token = await messaging.getToken();
      if (token == null) {
        if (mounted) setState(() => _status = 'Could not obtain a push token.');
        return;
      }

      await ref.read(apiProvider).post('/notifications/device', body: {
        'token': token,
        'platform': isIos ? 'ios' : 'android',
      });
      if (mounted) setState(() => _status = 'This device is registered for push.');
    } catch (e) {
      if (mounted) setState(() => _status = 'Push registration unavailable.');
    }
  }

  @override
  Widget build(BuildContext context) => Text(
        _status ?? 'Registering this device…',
        style: Theme.of(context).textTheme.bodySmall,
      );
}
