import { Lock } from 'lucide-react';

export default function HistoryPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4 max-w-md mx-auto text-center">
      <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-muted">
        <Lock className="h-8 w-8 text-muted-foreground" />
      </div>
      <h1 className="text-2xl font-bold tracking-tight">Tính năng đã được tắt</h1>
      <p className="text-sm text-muted-foreground">
        Trang này hiển thị thông tin các cuộc trò chuyện giữa bot và người dùng khác,
        bao gồm nội dung phản hồi mà bot đã gửi tới họ.
      </p>
      <p className="text-sm text-muted-foreground">
        Để bảo mật thông tin riêng tư của người dùng, quyền truy cập vào lịch sử cuộc trò chuyện
        đã được giới hạn.
      </p>
    </div>
  );
}
