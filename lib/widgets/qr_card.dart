import 'package:flutter/material.dart';
import '../models/qr_result.dart';

class QrCard extends StatelessWidget {
  final QrResult qr;

  const QrCard({super.key, required this.qr});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF1A1A2E),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFFF6B35).withOpacity(0.3)),
      ),
      padding: const EdgeInsets.all(20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            qr.presetName,
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: Color(0xFFFF6B35),
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 4),
          Text(
            qr.deviceName,
            style: TextStyle(
              fontSize: 12,
              color: Colors.white.withOpacity(0.5),
            ),
          ),
          const SizedBox(height: 16),
          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(8),
            ),
            padding: const EdgeInsets.all(8),
            child: Image.network(
              qr.imageBase64,
              width: 200,
              height: 200,
              fit: BoxFit.contain,
            ),
          ),
          const SizedBox(height: 16),
          ..._buildSettings(),
        ],
      ),
    );
  }

  List<Widget> _buildSettings() {
    return qr.settings.map((slot) {
      final slotName = slot['slot'] as String? ?? '';
      final selection = slot['selection'] as String? ?? '';
      final enabled = slot['enabled'] as bool? ?? true;

      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(
          children: [
            Icon(
              enabled ? Icons.check_circle : Icons.cancel,
              size: 14,
              color: enabled
                  ? const Color(0xFF4CAF50)
                  : Colors.white.withOpacity(0.3),
            ),
            const SizedBox(width: 6),
            Text(
              '$slotName: ',
              style: TextStyle(
                fontSize: 11,
                color: Colors.white.withOpacity(0.5),
              ),
            ),
            Expanded(
              child: Text(
                selection,
                style: const TextStyle(fontSize: 11, color: Colors.white),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      );
    }).toList();
  }
}
