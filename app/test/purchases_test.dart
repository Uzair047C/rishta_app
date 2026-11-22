import 'package:flutter_test/flutter_test.dart';

import 'package:rishta/core/purchases.dart';

// The one non-trivial branch of the billing wrapper: compiled without
// RevenueCat API keys (every dev/test build), init() must complete without
// touching platform channels and leave billing marked unavailable — the rest
// of the app keeps working. Test VMs have no MethodChannel implementation, so
// if the guard ever lets an empty-key build reach Purchases.configure, this
// fails with MissingPluginException.
void main() {
  test('init without API keys marks billing unavailable and does not throw', () async {
    await PurchasesService.init('00000000-0000-0000-0000-000000000000');
    expect(PurchasesService.available, isFalse);
  });
}
