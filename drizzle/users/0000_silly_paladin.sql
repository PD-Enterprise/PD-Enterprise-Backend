-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE "posts" (
	"post_id" serial PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"author_id" varchar(255),
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "posts_slug_key" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "apikeys" (
	"id" serial PRIMARY KEY NOT NULL,
	"key_name" varchar(255),
	"api_key" varchar(255) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"userpassword" varchar(255) NOT NULL,
	"username" varchar(255) NOT NULL,
	"session_id" varchar(255) NOT NULL,
	"membership" varchar(255),
	"provider" varchar(255),
	CONSTRAINT "users_userpassword_key" UNIQUE("userpassword")
);

*/