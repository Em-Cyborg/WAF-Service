
import { initiatePayment } from '../utils/paymentService';

interface PaymentSectionProps {
  chargeAmount: number;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

const PaymentSection: React.FC<PaymentSectionProps> = ({
  chargeAmount,
  isLoading,
  setIsLoading
}) => {
  const handlePayment = async () => {
    if (chargeAmount <= 0) return;
    
    try {
      setIsLoading(true);
      await initiatePayment(chargeAmount);
    } catch (error) {
      console.error('결제 오류:', error);
      alert('결제 중 오류가 발생했습니다: ' + (error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-gray-50 rounded-lg p-4 space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-gray-600">충전 포인트</span>
          <span className="font-medium">{chargeAmount.toLocaleString()} Point</span>
        </div>
        <div className="flex justify-between items-center text-lg font-bold border-t pt-3">
          <span>결제 금액</span>
          <span className="text-blue-600">{chargeAmount.toLocaleString()}원</span>
        </div>
      </div>

      <button
        onClick={handlePayment}
        disabled={chargeAmount <= 0 || isLoading}
        className={`w-full py-4 rounded-lg font-bold text-lg transition-all ${
          chargeAmount <= 0 || isLoading
            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-xl'
        }`}
      >
        {isLoading
          ? '결제 준비 중...'
          : chargeAmount > 0
          ? `${chargeAmount.toLocaleString()}원 결제하기`
          : '결제하기'
        }
      </button>
    </div>
  );
};

export default PaymentSection;

