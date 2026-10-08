-- AlterEnum
ALTER TYPE "WhatsAppConversationMessageStatus" ADD VALUE 'DELIVERED';
ALTER TYPE "WhatsAppConversationMessageStatus" ADD VALUE 'READ';

-- AlterTable
ALTER TABLE "whatsapp_messages" ADD COLUMN "deliveredAt" TIMESTAMP(3);
ALTER TABLE "whatsapp_messages" ADD COLUMN "readAt" TIMESTAMP(3);
