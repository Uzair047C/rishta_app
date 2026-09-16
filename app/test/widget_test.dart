import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rishta/main.dart';

void main() {
  testWidgets('RishtaApp smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: RishtaApp(),
      ),
    );
    expect(find.byType(RishtaApp), findsOneWidget);
  });
}
