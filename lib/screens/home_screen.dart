import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import '../models/message.dart';
import '../models/qr_result.dart';
import '../services/api_service.dart';
import '../widgets/qr_card.dart';

class _ChatItem {
  final String role;
  final String content;
  final QrResult? qr;

  const _ChatItem({required this.role, required this.content, this.qr});
}

class HomeScreen extends StatefulWidget {
  final ApiService apiService;

  const HomeScreen({super.key, required this.apiService});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _controller = TextEditingController();
  final _scrollController = ScrollController();
  final List<_ChatItem> _items = [];
  QrResult? _currentQr;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty || _loading) return;

    setState(() {
      _items.add(_ChatItem(role: 'user', content: text));
      _loading = true;
      _error = null;
    });
    _controller.clear();
    _scrollToBottom();

    try {
      final messages = _items
          .where((i) => i.role == 'user' || i.role == 'assistant')
          .map((i) => Message(role: i.role, content: i.content))
          .toList();

      final response = await widget.apiService.sendMessage(messages);

      setState(() {
        _items.add(_ChatItem(
          role: 'assistant',
          content: response.message,
          qr: response.qr,
        ));
        if (response.qr != null) _currentQr = response.qr;
        _loading = false;
      });
    } on FreeLimitException {
      setState(() {
        _loading = false;
        _error = 'Free limit reached (${widget.apiService.generationsLimit} generations used).';
      });
    } catch (e) {
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }

    _scrollToBottom();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F0F23),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1A1A2E),
        elevation: 0,
        title: Row(
          children: [
            const Icon(Icons.qr_code_2, color: Color(0xFFFF6B35), size: 28),
            const SizedBox(width: 10),
            const Text(
              'Mighty AI QR',
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.bold,
                fontSize: 18,
              ),
            ),
          ],
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: _UsageBadge(apiService: widget.apiService),
          ),
        ],
      ),
      body: LayoutBuilder(
        builder: (context, constraints) {
          final isWide = constraints.maxWidth > 800;
          return isWide ? _wideLayout() : _narrowLayout();
        },
      ),
    );
  }

  Widget _wideLayout() {
    return Row(
      children: [
        Expanded(flex: 3, child: _chatPanel()),
        Container(width: 1, color: const Color(0xFF2A2A3E)),
        Expanded(flex: 2, child: _qrPanel()),
      ],
    );
  }

  Widget _narrowLayout() {
    return Column(
      children: [
        if (_currentQr != null)
          Padding(
            padding: const EdgeInsets.all(16),
            child: QrCard(qr: _currentQr!),
          ),
        Expanded(child: _chatPanel()),
      ],
    );
  }

  Widget _chatPanel() {
    return Column(
      children: [
        Expanded(
          child: _items.isEmpty
              ? _emptyState()
              : ListView.builder(
                  controller: _scrollController,
                  padding: const EdgeInsets.all(16),
                  itemCount: _items.length + (_loading ? 1 : 0),
                  itemBuilder: (context, i) {
                    if (i == _items.length) return _typingIndicator();
                    return _buildBubble(_items[i]);
                  },
                ),
        ),
        if (_error != null)
          Container(
            color: const Color(0xFF3A1A1A),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                const Icon(Icons.error_outline, color: Color(0xFFFF5252), size: 16),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    _error!,
                    style: const TextStyle(color: Color(0xFFFF5252), fontSize: 13),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close, size: 16),
                  color: const Color(0xFFFF5252),
                  onPressed: () => setState(() => _error = null),
                ),
              ],
            ),
          ),
        _inputBar(),
      ],
    );
  }

  Widget _qrPanel() {
    return Container(
      color: const Color(0xFF0D0D1F),
      child: _currentQr == null
          ? Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.qr_code_2,
                    size: 64,
                    color: Colors.white.withOpacity(0.1),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'Your QR code will\nappear here',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Colors.white.withOpacity(0.2),
                      fontSize: 14,
                    ),
                  ),
                ],
              ),
            )
          : SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: QrCard(qr: _currentQr!),
            ),
    );
  }

  Widget _emptyState() {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.music_note,
            size: 56,
            color: const Color(0xFFFF6B35).withOpacity(0.3),
          ),
          const SizedBox(height: 16),
          Text(
            'Describe your tone',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: Colors.white.withOpacity(0.6),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            '"Kashmir tone from Knebworth 1979"\n"Warm blues crunch with slapback delay"',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 13,
              color: Colors.white.withOpacity(0.3),
              height: 1.6,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBubble(_ChatItem item) {
    final isUser = item.role == 'user';
    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        constraints: const BoxConstraints(maxWidth: 600),
        child: isUser
            ? Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                decoration: BoxDecoration(
                  color: const Color(0xFFFF6B35),
                  borderRadius: BorderRadius.circular(18),
                ),
                child: Text(
                  item.content,
                  style: const TextStyle(color: Colors.white, fontSize: 14),
                ),
              )
            : Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: const Color(0xFF1A1A2E),
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(
                        color: const Color(0xFF2A2A4E),
                      ),
                    ),
                    child: MarkdownBody(
                      data: item.content,
                      styleSheet: MarkdownStyleSheet(
                        p: const TextStyle(color: Colors.white, fontSize: 14, height: 1.5),
                        h2: const TextStyle(
                          color: Color(0xFFFF6B35),
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                        h3: TextStyle(
                          color: Colors.white.withOpacity(0.9),
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                        ),
                        strong: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                        ),
                        listBullet: TextStyle(
                          color: Colors.white.withOpacity(0.7),
                          fontSize: 14,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
      ),
    );
  }

  Widget _typingIndicator() {
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: const Color(0xFF1A1A2E),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: const Color(0xFF2A2A4E)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: 40,
              child: LinearProgressIndicator(
                backgroundColor: const Color(0xFF2A2A4E),
                color: const Color(0xFFFF6B35),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(width: 8),
            Text(
              'Generating...',
              style: TextStyle(
                color: Colors.white.withOpacity(0.4),
                fontSize: 13,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _inputBar() {
    return Container(
      decoration: const BoxDecoration(
        color: Color(0xFF1A1A2E),
        border: Border(top: BorderSide(color: Color(0xFF2A2A3E))),
      ),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _controller,
              onSubmitted: (_) => _send(),
              enabled: !_loading,
              maxLines: null,
              style: const TextStyle(color: Colors.white, fontSize: 14),
              decoration: InputDecoration(
                hintText: 'Describe your tone...',
                hintStyle: TextStyle(color: Colors.white.withOpacity(0.3)),
                filled: true,
                fillColor: const Color(0xFF0F0F23),
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 12,
                ),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(24),
                  borderSide: BorderSide.none,
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(24),
                  borderSide: const BorderSide(
                    color: Color(0xFFFF6B35),
                    width: 1.5,
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          _SendButton(loading: _loading, onPressed: _send),
        ],
      ),
    );
  }
}

class _UsageBadge extends StatelessWidget {
  final ApiService apiService;

  const _UsageBadge({required this.apiService});

  @override
  Widget build(BuildContext context) {
    if (apiService.hasActiveSubscription) {
      return const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.star, color: Color(0xFFFFB347), size: 14),
          SizedBox(width: 4),
          Text(
            'Pro',
            style: TextStyle(color: Color(0xFFFFB347), fontSize: 13),
          ),
        ],
      );
    }

    return Text(
      '${apiService.freeRemaining} free left',
      style: TextStyle(
        color: apiService.freeRemaining <= 2
            ? const Color(0xFFFF5252)
            : Colors.white.withOpacity(0.5),
        fontSize: 12,
      ),
    );
  }
}

class _SendButton extends StatelessWidget {
  final bool loading;
  final VoidCallback onPressed;

  const _SendButton({required this.loading, required this.onPressed});

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      width: 48,
      height: 48,
      child: ElevatedButton(
        onPressed: loading ? null : onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: const Color(0xFFFF6B35),
          disabledBackgroundColor: const Color(0xFF3A2A1E),
          shape: const CircleBorder(),
          padding: EdgeInsets.zero,
        ),
        child: loading
            ? const SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Colors.white,
                ),
              )
            : const Icon(Icons.send, color: Colors.white, size: 20),
      ),
    );
  }
}
